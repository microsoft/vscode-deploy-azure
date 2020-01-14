import * as path from 'path';
import * as fs from 'fs';
import * as utils from 'util';
import * as vscode from 'vscode';
import { Configurer } from "./configurerBase";
import { WizardInputs, AzureSession, TargetResourceType, AzureConnectionType } from "../model/models";
import { LocalGitRepoHelper } from '../helper/LocalGitRepoHelper';
import { Messages } from '../resources/messages';
import { UserCancelledError } from 'vscode-azureextensionui';
import { telemetryHelper } from '../helper/telemetryHelper';
import { TelemetryKeys } from '../resources/telemetryKeys';
import { ControlProvider } from '../helper/controlProvider';
import { GraphHelper } from '../helper/graphHelper';
import { TracePoints } from '../resources/tracePoints';
import { AppServiceClient, DeploymentMessage } from '../clients/azure/appServiceClient';
import { AzureResourceClient } from '../clients/azure/azureResourceClient';
import { GitHubProvider } from "../helper/gitHubHelper";
import * as Q from 'q';
import * as constants from '../resources/constants';

const Layer = 'GitHubWorkflowConfigurer';

export class GitHubWorkflowConfigurer implements Configurer {
    private queuedPipelineUrl: string;
    private controlProvider: ControlProvider;

    constructor(azureSession: AzureSession, subscriptionId: string) {
        this.controlProvider = new ControlProvider();
    }

    public async getInputs(inputs: WizardInputs): Promise<void> {
        inputs.githubPATToken = await this.controlProvider.showInputBox(constants.GitHubPat, {
            placeHolder: Messages.enterGitHubPat,
            prompt: Messages.githubPatTokenHelpMessage,
            validateInput: (inputValue) => {
                return !inputValue ? Messages.githubPatTokenErrorMessage : null;
            }
        });
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
                    title: utils.format(Messages.creatingAzureServiceConnection, inputs.targetResource.subscriptionId)
                },
                async () => {
                    try {
                        switch (inputs.pipelineParameters.pipelineTemplate.azureConnectionType) {
                            case AzureConnectionType.None:
                                return null;
                            case AzureConnectionType.AzureRMPublishProfile:
                                return await (azureResourceClient as AppServiceClient).getWebAppPublishProfileXml(inputs.targetResource.resource.id);
                            case AzureConnectionType.AzureRMServicePrincipal:
                            default:
                        }
                    }
                    catch (error) {
                        telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                        throw error;
                    }
                });
            
            if (true) {
                try {
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: "Setting up Github Workflow"
                        },
                        async () => {
                            let secret: string =  await this.getAzureSPNSecret(inputs);
                            let result = await GitHubProvider.createGithubSecret(secret, inputs.githubPATToken, inputs.sourceRepository.remoteUrl);
                            return result;
                        });
                } catch (error) {
                    // Add telemetry
                    throw error;
                }
            }
        }
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
                        return await localGitRepoHelper.commitAndPushPipelineFile(inputs.pipelineParameters.pipelineFilePath, inputs.sourceRepository, Messages.addGitHubWorkflowYmlFile);
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

    public async executePostPipelineCreationSteps(inputs: WizardInputs, azureResourceClient: AzureResourceClient): Promise<void> {
        if (inputs.targetResource.resource.type === TargetResourceType.WebApp) {
            try {
                let appServiceClient = azureResourceClient as AppServiceClient;
                
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
                    let configPath = path.relative(repositoryPath, inputs.pipelineParameters.pipelineFilePath);
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
