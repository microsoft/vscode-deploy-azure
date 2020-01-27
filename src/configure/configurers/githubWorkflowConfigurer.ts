import * as fs from 'fs';
import * as path from 'path';
import * as Q from 'q';
import * as utils from 'util';
import * as vscode from 'vscode';
const uuid = require('uuid/v4');
import { UserCancelledError } from 'vscode-azureextensionui';
import { AppServiceClient, DeploymentMessage } from '../clients/azure/appServiceClient';
import { AzureResourceClient } from '../clients/azure/azureResourceClient';
import { ControlProvider } from '../helper/controlProvider';
import { GraphHelper } from '../helper/graphHelper';
import { LocalGitRepoHelper } from '../helper/LocalGitRepoHelper';
import { telemetryHelper } from '../helper/telemetryHelper';
import { AzureConnectionType, AzureSession, ServiceConnectionType, TargetResourceType, WizardInputs } from "../model/models";
import * as constants from '../resources/constants';
import { GithubClient } from '../clients/github/githubClient';
import { Messages } from '../resources/messages';
import { TelemetryKeys } from '../resources/telemetryKeys';
import { TracePoints } from '../resources/tracePoints';
import { Configurer } from "./configurerBase";
import { extensionVariables } from "../model/models";

const Layer = 'GitHubWorkflowConfigurer';

export class GitHubWorkflowConfigurer implements Configurer {
    private queuedPipelineUrl: string;
    private controlProvider: ControlProvider;
    private githubClient: GithubClient;

    constructor(azureSession: AzureSession, subscriptionId: string) {
        this.controlProvider = new ControlProvider();
    }

    public async getInputs(inputs: WizardInputs): Promise<void> {
        inputs.githubPATToken = await this.controlProvider.showInputBox(constants.GitHubPat, {
            placeHolder: Messages.enterGitHubPat,
            prompt: Messages.githubPatTokenHelpMessageGithubWorkflow,
            validateInput: (inputValue) => {
                return !inputValue ? Messages.githubPatTokenErrorMessage : null;
            }
        });
        this.githubClient = new GithubClient(inputs.githubPATToken, inputs.sourceRepository.remoteUrl);
        return;
    }

    public async validatePermissions(): Promise<void> {
        return;
    }

    public async createPreRequisites(inputs: WizardInputs, azureResourceClient: AzureResourceClient): Promise<void> {
        if (inputs.targetResource.resource.type.toLowerCase() === TargetResourceType.WebApp.toLowerCase()) {
            let azureConnectionSecret: string = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: utils.format(Messages.creatingAzureServiceConnection, inputs.subscriptionId)
                },
                async () => {
                    try {
                        switch (inputs.pipelineConfiguration.template.azureConnectionType) {
                            case AzureConnectionType.None:
                                return null;
                            case AzureConnectionType.AzureRMPublishProfile:
                                return await (azureResourceClient as AppServiceClient).getWebAppPublishProfileXml(inputs.targetResource.resource.id);
                            case AzureConnectionType.AzureRMServicePrincipal:
                            default:
                                return await this.getAzureSPNSecret(inputs);
                        }
                    }
                    catch (error) {
                        telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                        throw error;
                    }
                });

            if (!!azureConnectionSecret) {
                inputs.targetResource.serviceConnectionId = 'AZURE_CREDENTIALS_' + uuid().substr(0, 16);
                try {
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: Messages.settingUpGithubSecrets
                        },
                        async () => {
                            await this.createSecretOrServiceConnection(inputs.targetResource.serviceConnectionId, ServiceConnectionType.AzureRM, azureConnectionSecret, inputs);
                        });
                } catch (error) {
                    telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                    throw error;
                }
            }
        }
    }

    public async createSecretOrServiceConnection(
        name: string,
        type: ServiceConnectionType,
        data: any,
        inputs: WizardInputs): Promise<string> {
        let secret = null;
        switch (type) {
            case ServiceConnectionType.AzureRM:
                secret = data;
                break;
            case ServiceConnectionType.ACR:
            case ServiceConnectionType.AKS:
            default:
                throw new Error(utils.format(Messages.assetOfTypeNotSupported, type));
        }

        if (secret) {    
            await this.githubClient.createOrUpdateGithubSecret(name, secret);        
        }

        return null;
    }

    public async getPathToPipelineFile(inputs: WizardInputs, localGitRepoHelper: LocalGitRepoHelper): Promise<string> {
        // Create .github directory
        let workflowDirectoryPath = path.join(await localGitRepoHelper.getGitRootDirectory(), '.github');
        if (!fs.existsSync(workflowDirectoryPath)) {
            fs.mkdirSync(workflowDirectoryPath);
        }

        // Create .github/workflows directory
        workflowDirectoryPath = path.join(workflowDirectoryPath, 'workflows');
        if (!fs.existsSync(workflowDirectoryPath)) {
            fs.mkdirSync(workflowDirectoryPath);
        }

        let pipelineFileName = await LocalGitRepoHelper.GetAvailableFileName('workflow.yml', workflowDirectoryPath);
        return path.join(workflowDirectoryPath, pipelineFileName);
    }

    public async checkInPipelineFileToRepository(inputs: WizardInputs, localGitRepoHelper: LocalGitRepoHelper): Promise<string> {

        while (!inputs.sourceRepository.commitId) {
            let commitOrDiscard = await vscode.window.showInformationMessage(
                utils.format(Messages.modifyAndCommitFile, Messages.commitAndPush, inputs.sourceRepository.branch, inputs.sourceRepository.remoteName),
                Messages.commitAndPush,
                Messages.discardPipeline);

            if (!!commitOrDiscard && commitOrDiscard.toLowerCase() === Messages.commitAndPush.toLowerCase()) {
                inputs.sourceRepository.commitId = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: Messages.configuringPipelineAndDeployment }, async () => {
                    try {
                        // handle when the branch is not upto date with remote branch and push fails
                        return await localGitRepoHelper.commitAndPushPipelineFile(inputs.pipelineConfiguration.filePath, inputs.sourceRepository, extensionVariables.enableGitHubWorkflow ? Messages.addGitHubWorkflowYmlFile : Messages.addAzurePipelinesYmlFile );
                    }
                    catch (error) {
                        telemetryHelper.logError(Layer, TracePoints.CheckInPipelineFailure, error);
                        vscode.window.showErrorMessage(utils.format(Messages.commitFailedErrorMessage, error.message));
                        return null;
                    }
                });
            }
            else {
                telemetryHelper.setTelemetry(TelemetryKeys.PipelineDiscarded, 'true');
                throw new UserCancelledError(Messages.operationCancelled);
            }
        }

        return inputs.sourceRepository.commitId;
    }

    public async createAndQueuePipeline(inputs: WizardInputs): Promise<string> {
        this.queuedPipelineUrl = `https://github.com/${inputs.sourceRepository.repositoryId}/commit/${inputs.sourceRepository.commitId}/checks`;
        return this.queuedPipelineUrl;
    }

    public async executePostPipelineCreationSteps(inputs: WizardInputs): Promise<void> {
        if (inputs.targetResource.resource.type === TargetResourceType.WebApp) {
            try {
                let appServiceClient = new AppServiceClient(inputs.azureSession.credentials, inputs.azureSession.environment, inputs.azureSession.tenantId, inputs.subscriptionId);

                // Update web app sourceControls as GitHubAction
                let sourceControlProperties = {
                    "isGitHubAction": true,
                    "repoUrl": `https://github.com/${inputs.sourceRepository.repositoryId}`,
                    "branch": inputs.sourceRepository.branch,
                };
                await appServiceClient.setSourceControl(inputs.targetResource.resource.id, sourceControlProperties);

                // Update web app metadata
                let updateMetadataPromise = new Promise<void>(async (resolve) => {
                    let metadata = await appServiceClient.getAppServiceMetadata(inputs.targetResource.resource.id);
                    metadata["properties"] = metadata["properties"] ? metadata["properties"] : {};

                    let repositoryPath = await LocalGitRepoHelper.GetHelperInstance(inputs.sourceRepository.localPath).getGitRootDirectory();
                    let configPath = path.relative(repositoryPath, inputs.pipelineConfiguration.filePath);
                    metadata["properties"]["configPath"] = `${configPath}`;

                    await appServiceClient.updateAppServiceMetadata(inputs.targetResource.resource.id, metadata);
                    resolve();
                });

                // send a deployment log with information about the setup pipeline and links.
                let deploymentMessage = JSON.stringify(<DeploymentMessage>{
                    type: constants.DeploymentMessageType,
                    message: Messages.deploymentLogMessage
                });

                let updateDeploymentLogPromise = appServiceClient.publishDeploymentToAppService(inputs.targetResource.resource.id, deploymentMessage);

                Q.all([updateMetadataPromise, updateDeploymentLogPromise])
                    .then(() => {
                        telemetryHelper.setTelemetry(TelemetryKeys.UpdatedWebAppMetadata, 'true');
                    });
            }
            catch (error) {
                telemetryHelper.logError(Layer, TracePoints.PostDeploymentActionFailed, error);
            }
        }
    }

    public async browseQueuedPipeline(): Promise<void> {
        vscode.window.showInformationMessage(Messages.githubWorkflowSetupSuccessfully, Messages.browseWorkflow)
            .then((action: string) => {
                if (action && action.toLowerCase() === Messages.browseWorkflow.toLowerCase()) {
                    telemetryHelper.setTelemetry(TelemetryKeys.BrowsePipelineClicked, 'true');
                    vscode.env.openExternal(vscode.Uri.parse(this.queuedPipelineUrl));
                }
            });
    }

    private async getAzureSPNSecret(inputs: WizardInputs): Promise<string> {
        let scope = inputs.targetResource.resource.id;
        let aadAppName = GraphHelper.generateAadApplicationName(inputs.sourceRepository.remoteName, 'github');
        let aadApp = await GraphHelper.createSpnAndAssignRole(inputs.azureSession, aadAppName, scope);
        return JSON.stringify({
            "clientId": `${aadApp.appId}`,
            "clientSecret": `${aadApp.secret}`,
            "subscriptionId": `${inputs.targetResource.subscriptionId}`,
            "tenantId": `${inputs.azureSession.tenantId}`,
        });
    }
}
