import * as fs from 'fs';
import * as path from 'path';
import * as Q from 'q';
import * as utils from 'util';
import * as vscode from 'vscode';
import { UserCancelledError } from 'vscode-azureextensionui';
import { AppServiceClient, DeploymentMessage } from '../clients/azure/appServiceClient';
import { ControlProvider } from '../helper/controlProvider';
import { GraphHelper } from '../helper/graphHelper';
import { LocalGitRepoHelper } from '../helper/LocalGitRepoHelper';
import { telemetryHelper } from '../helper/telemetryHelper';
import { AzureSession, ServiceConnectionType, TargetResourceType, WizardInputs } from "../model/models";
import * as constants from '../resources/constants';
import { Messages } from '../resources/messages';
import { TelemetryKeys } from '../resources/telemetryKeys';
import { TracePoints } from '../resources/tracePoints';
import { Configurer } from "./configurerBase";

const Layer = 'GitHubWorkflowConfigurer';

export class GitHubWorkflowConfigurer implements Configurer {
    private queuedPipelineUrl: string;

    constructor(azureSession: AzureSession, subscriptionId: string) {
    }

    public async getInputs(inputs: WizardInputs): Promise<void> {
        return;
    }

    public async validatePermissions(): Promise<void> {
        return;
    }

    public async createPreRequisites(inputs: WizardInputs): Promise<void> {
        if (inputs.targetResource.resource && inputs.targetResource.resource.type.toLowerCase() === TargetResourceType.WebApp.toLowerCase()) {
            let azureConnectionSecret = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: utils.format(Messages.creatingAzureServiceConnection, inputs.subscriptionId)
                },
                async () => {
                    try {
                        let scope = inputs.targetResource.resource.id;
                        let aadAppName = GraphHelper.generateAadApplicationName(inputs.sourceRepository.remoteName, 'github');
                        let aadApp = await GraphHelper.createSpnAndAssignRole(inputs.azureSession, aadAppName, scope);
                        return {
                            "clientId": `${aadApp.appId}`,
                            "clientSecret": `${aadApp.secret}`,
                            "subscriptionId": `${inputs.subscriptionId}`,
                            "tenantId": `${inputs.azureSession.tenantId}`,
                        };
                    }
                    catch (error) {
                        telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                        throw error;
                    }
                });

            let showCopyAndOpenNotificationFunction = (nextLabel = false) => {
                return this.showCopyAndOpenNotification(
                    JSON.stringify(azureConnectionSecret),
                    `https://github.com/${inputs.sourceRepository.repositoryId}/settings/secrets`,
                    utils.format(Messages.copyAndCreateSecretMessage, 'AZURE_CREDENTIALS'),
                    'copyAzureCredentials',
                    nextLabel);
            };

            let copyAndOpen = await showCopyAndOpenNotificationFunction();
            if (copyAndOpen === Messages.copyAndOpenLabel) {
                let nextSelected = "";
                while (nextSelected !== Messages.nextLabel) {
                    nextSelected = await showCopyAndOpenNotificationFunction(true);
                    if (nextSelected === undefined) {
                        throw new UserCancelledError(Messages.operationCancelled);
                    }
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
                    secret = {
                        "clientId": `${data.aadApp.appId}`,
                        "clientSecret": `${data.aadApp.secret}`,
                        "subscriptionId": `${inputs.subscriptionId}`,
                        "tenantId": `${inputs.azureSession.tenantId}`,
                    };
                    break;
                case ServiceConnectionType.ACR:
                case ServiceConnectionType.AKS:
                default:
                    throw new Error(utils.format(Messages.assetOfTypeNotSupported, type));
            }

            if (secret) {
                let showCopyAndOpenNotificationFunction = (nextLabel = false) => {
                    return this.showCopyAndOpenNotification(
                        JSON.stringify(secret),
                        `https://github.com/${inputs.sourceRepository.repositoryId}/settings/secrets`,
                        utils.format(Messages.copyAndCreateSecretMessage, name),
                        'copyAzureCredentials',
                        nextLabel);
                };

                let copyAndOpen = await showCopyAndOpenNotificationFunction();
                if (copyAndOpen === Messages.copyAndOpenLabel) {
                    let nextSelected = "";
                    while (nextSelected !== Messages.nextLabel) {
                        nextSelected = await showCopyAndOpenNotificationFunction(true);
                        if (nextSelected === undefined) {
                            throw new UserCancelledError(Messages.operationCancelled);
                        }
                    }
                }

                return name;
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
                        return await localGitRepoHelper.commitAndPushPipelineFile(inputs.pipelineConfiguration.filePath, inputs.sourceRepository, Messages.addAzurePipelinesYmlFile);
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

    private async showCopyAndOpenNotification(valueToBeCopied: string, urlToBeOpened: string, messageToBeShown: string, messageIdentifier: string, showNextButton = false): Promise<string> {
        let actions: Array<string> = showNextButton ? [Messages.copyAndOpenLabel, Messages.nextLabel] : [Messages.copyAndOpenLabel];
        let controlProvider = new ControlProvider();
        let copyAndOpen = await controlProvider.showInformationBox(
            messageIdentifier,
            messageToBeShown,
            ...actions);
        if (copyAndOpen === Messages.copyAndOpenLabel) {
            await vscode.env.clipboard.writeText(valueToBeCopied);
            await vscode.env.openExternal(vscode.Uri.parse(urlToBeOpened));
        }

        return copyAndOpen;
    }
}
