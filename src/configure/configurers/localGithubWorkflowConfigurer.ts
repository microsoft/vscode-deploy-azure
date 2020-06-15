import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import * as fs from 'fs';
import * as ymlconfig from 'js-yaml';
import * as path from 'path';
import * as Q from 'q';
import * as utils from 'util';
import * as vscode from 'vscode';
import { UserCancelledError } from 'vscode-azureextensionui';
import { AppServiceClient, DeploymentMessage } from '../clients/azure/appServiceClient';
import { ApiVersions, AzureResourceClient } from '../clients/azure/azureResourceClient';
import { GithubClient } from '../clients/github/githubClient';
import { ControlProvider } from '../helper/controlProvider';
import { GitHubProvider } from '../helper/gitHubHelper';
import { GraphHelper } from '../helper/graphHelper';
import { LocalGitRepoHelper } from '../helper/LocalGitRepoHelper';
import { telemetryHelper } from '../helper/telemetryHelper';
import { TemplateParameterHelper } from '../helper/templateParameterHelper';
import { AzureConnectionType, AzureSession, extensionVariables, GitHubRepo, TargetResourceType, WizardInputs } from "../model/models";
import { LocalPipelineTemplate, TemplateAssetType } from '../model/templateModels';
import * as constants from '../resources/constants';
import { Messages } from '../resources/messages';
import { TelemetryKeys } from '../resources/telemetryKeys';
import { TracePoints } from '../resources/tracePoints';
import { Configurer } from "./configurerBase";


const uuid = require('uuid/v4');
const Layer = 'LocalGitHubWorkflowConfigurer';

export class LocalGitHubWorkflowConfigurer implements Configurer {
    protected githubClient: GithubClient;
    private queuedPipelineUrl: string;
    private controlProvider: ControlProvider;
    private localGitRepoHelper : LocalGitRepoHelper;

    constructor(azureSession: AzureSession, subscriptionId: string, localgitRepoHelper: LocalGitRepoHelper) {
        this.controlProvider = new ControlProvider();
        this.localGitRepoHelper = localgitRepoHelper;
    }

    public async getInputs(inputs: WizardInputs): Promise<void> {
        this.githubClient = new GithubClient(inputs.githubPATToken, inputs.sourceRepository.remoteUrl);
        try {
            inputs.isNewOrganization = false;
            if (!inputs.sourceRepository.remoteUrl) {
                let githubOrganizations = await this.githubClient.listOrganizations(inputs.githubPATToken);
               
                if ( githubOrganizations &&  githubOrganizations.length > 0) {
                    let selectedOrganization = await this.controlProvider.showQuickPick(
                        constants.SelectGitHubOrganization,
                        githubOrganizations.map(x => { return { label: x.login }; }),
                        { placeHolder: Messages.selectGitHubOrganizationName },
                        TelemetryKeys.OrganizationListCount);
                        inputs.organizationName = selectedOrganization.label;


                    let newGitHubRepo = await this.githubClient.generateGitHubRepository(inputs.organizationName, inputs.sourceRepository.localPath) as unknown as GitHubRepo | void;
                    if(newGitHubRepo){
                        inputs.sourceRepository.remoteName = newGitHubRepo.name;
                        inputs.sourceRepository.remoteUrl = newGitHubRepo.html_url+".git";
                        inputs.sourceRepository.repositoryId = GitHubProvider.getRepositoryIdFromUrl(inputs.sourceRepository.remoteUrl);
                        await this.localGitRepoHelper.initializeGitRepository(inputs.sourceRepository.remoteName, inputs.sourceRepository.remoteUrl);
                        vscode.window.showInformationMessage(utils.format(Messages.newGitHubRepositoryCreated, newGitHubRepo.name));
                    }
                    else{
                        vscode.window.showErrorMessage(Messages.cannotCreateGitHubRepository);
                        throw Error;
                    }
                    
                }
                else{
                    vscode.window.showErrorMessage(Messages.createGitHubOrganization);
                    throw Error;
                }
            }
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.GetGitHubDetailsFailed, error);
            throw error;
        }
    }

    public async validatePermissions(): Promise<void> {
        return;
    }

    public async createPreRequisites(inputs: WizardInputs, azureResourceClient: AzureResourceClient): Promise<void> {
        if (inputs.targetResource && inputs.targetResource.resource && inputs.targetResource.resource.type.toLowerCase() === TargetResourceType.WebApp.toLowerCase()) {
            let azureConnectionSecret: string = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: utils.format(Messages.creatingAzureServiceConnection, inputs.subscriptionId)
                },
                async () => {
                    try {
                        switch ((inputs.pipelineConfiguration.template as LocalPipelineTemplate).azureConnectionType) {
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
                inputs.targetResource.serviceConnectionId = 'AZURE_CREDENTIALS_' + uuid().substr(0, 8);
                try {
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: Messages.settingUpGithubSecrets
                        },
                        async () => {
                            await this.createAsset(inputs.targetResource.serviceConnectionId, TemplateAssetType.GitHubARM, azureConnectionSecret, inputs);
                        });
                } catch (error) {
                    telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                    throw error;
                }
            }
        }
    }

    public async createAsset(
        name: string,
        // tslint:disable-next-line:no-reserved-keywords
        type: TemplateAssetType,
        data: any,
        inputs: WizardInputs): Promise<string> {
        let secret: string = null;
        switch (type) {
            case TemplateAssetType.GitHubARM:
            case TemplateAssetType.GitHubAKSKubeConfig:
            case TemplateAssetType.GitHubRegistryUsername:
            case TemplateAssetType.GitHubRegistryPassword:
                secret = data;
                break;
            default:
                throw new Error(utils.format(Messages.assetOfTypeNotSupportedForGitHub, type));
        }

        if (secret) {
            await this.githubClient.createOrUpdateGithubSecret(name, secret);
        }

        return name;
    }

    public async getPathToPipelineFile(inputs: WizardInputs, localGitRepoHelper: LocalGitRepoHelper, pipelineFileName?: string): Promise<string> {
        // Create .github directory
        let workflowDirectoryPath = path.join('.github', 'workflows');
        if (!pipelineFileName) {
            pipelineFileName = 'workflow.yml';
        }
        return await this.getPathToFile(localGitRepoHelper, pipelineFileName, workflowDirectoryPath);
    }

    public async getPathToManifestFile(inputs: WizardInputs, localGitRepoHelper: LocalGitRepoHelper, fileName: string): Promise<string> {
        // Create manifests directory
        let manifestsDirectoryPath: string = path.join(inputs.pipelineConfiguration.workingDirectory, 'manifests');
        try {
            return await this.getPathToFile(localGitRepoHelper, fileName, manifestsDirectoryPath);
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.ManifestsFolderCreationFailed, error);
            throw error;
        }
    }

    public async getPathToFile(localGitRepoHelper: LocalGitRepoHelper, fileName: string, directory: string) {
        let dirList = directory.split(path.sep);
        let directoryPath: string = "";
        directoryPath = await localGitRepoHelper.getGitRootDirectory();
        dirList.forEach((dir) => {
            try {
                directoryPath = path.join(directoryPath, dir);
                if (!fs.existsSync(directoryPath)) {
                    fs.mkdirSync(directoryPath);
                }
            }
            catch (error) {
                throw error;
            }
        });
        fileName = await LocalGitRepoHelper.GetAvailableFileName(fileName, directoryPath);
        return path.join(directoryPath, fileName);
    }

    public async checkInPipelineFilesToRepository(filesToCommit: string[], inputs: WizardInputs, localGitRepoHelper: LocalGitRepoHelper): Promise<string> {
    
        while (!inputs.sourceRepository.commitId) {

            let displayMessage = Messages.modifyAndCommitFile;
            if (filesToCommit.length > 1) {
                displayMessage = Messages.modifyAndCommitMultipleFiles;
            }

            let commitOrDiscard = await vscode.window.showInformationMessage(
                utils.format(displayMessage, Messages.commitAndPush, inputs.sourceRepository.branch, inputs.sourceRepository.remoteName),
                Messages.commitAndPush,
                Messages.discardPipeline);

            if (!!commitOrDiscard && commitOrDiscard.toLowerCase() === Messages.commitAndPush.toLowerCase()) {
                inputs.sourceRepository.commitId = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: Messages.configuringPipelineAndDeployment }, async () => {
                    try {
                        // handle when the branch is not upto date with remote branch and push fails
                        return await localGitRepoHelper.commitAndPushPipelineFile(filesToCommit, inputs.sourceRepository, extensionVariables.enableGitHubWorkflow ? Messages.addGitHubWorkflowYmlFile : Messages.addAzurePipelinesYmlFile);
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
        try {
            if (inputs.targetResource && inputs.targetResource.resource && inputs.targetResource.resource.type === TargetResourceType.WebApp) {
                // Update web app sourceControls as GitHubAction
                let sourceControlProperties = {
                    "isGitHubAction": true,
                    "repoUrl": `https://github.com/${inputs.sourceRepository.repositoryId}`,
                    "branch": inputs.sourceRepository.branch,
                };
                await (azureResourceClient as AppServiceClient).setSourceControl(inputs.targetResource.resource.id, sourceControlProperties);

                // Update web app metadata
                let updateMetadataPromise = new Promise<void>(async (resolve) => {
                    let metadata = await (azureResourceClient as AppServiceClient).getAppServiceMetadata(inputs.targetResource.resource.id);
                    metadata["properties"] = metadata["properties"] ? metadata["properties"] : {};

                    let repositoryPath = await LocalGitRepoHelper.GetHelperInstance(inputs.sourceRepository.localPath).getGitRootDirectory();
                    let configPath = path.relative(repositoryPath, inputs.pipelineConfiguration.filePath);

                    const doc = ymlconfig.safeLoad(fs.readFileSync(inputs.pipelineConfiguration.filePath, 'utf8'));
                    if (!!doc["name"]) {
                        metadata["properties"]["configName"] = `${doc["name"]}`;
                    }
                    metadata["properties"]["configPath"] = `${configPath}`;

                    await (azureResourceClient as AppServiceClient).updateAppServiceMetadata(inputs.targetResource.resource.id, metadata);
                    resolve();
                });

                // send a deployment log with information about the setup pipeline and links.
                let deploymentMessage = JSON.stringify(<DeploymentMessage>{
                    type: constants.DeploymentMessageType,
                    message: Messages.deploymentLogMessage
                });

                let authorName = await LocalGitRepoHelper.GetHelperInstance(inputs.sourceRepository.localPath).getUsername();
                let deployerName = 'GITHUBACTION';
                let updateDeploymentLogPromise = (azureResourceClient as AppServiceClient).publishDeploymentToAppService(inputs.targetResource.resource.id, deploymentMessage, authorName, deployerName);

                Q.all([updateMetadataPromise, updateDeploymentLogPromise])
                    .then(() => {
                        telemetryHelper.setTelemetry(TelemetryKeys.UpdatedWebAppMetadata, 'true');
                    });
            }
            else if (TemplateParameterHelper.getParameterForTargetResourceType((inputs.pipelineConfiguration.template as LocalPipelineTemplate).parameters, TargetResourceType.AKS)) {
                let aksResource: GenericResource = inputs.pipelineConfiguration.params[TemplateParameterHelper.getParameterForTargetResourceType((inputs.pipelineConfiguration.template as LocalPipelineTemplate).parameters, TargetResourceType.AKS).name];
                let workflowFileName = path.basename(inputs.pipelineConfiguration.filePath);
                await azureResourceClient.updateCdSetupResourceTag(aksResource, inputs.sourceRepository.repositoryId, inputs.sourceRepository.branch, workflowFileName, inputs.sourceRepository.commitId, inputs.pipelineConfiguration.params['namespace'], ApiVersions.get(TargetResourceType.AKS));
            }
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.PostDeploymentActionFailed, error);
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

    protected async getAzureSPNSecret(inputs: WizardInputs, scope?: string): Promise<string> {
        scope = !scope ? inputs.targetResource.resource.id : scope;
        let aadAppName = GraphHelper.generateAadApplicationName(inputs.sourceRepository.remoteName, 'github');
        let aadApp = await GraphHelper.createSpnAndAssignRole(inputs.azureSession, aadAppName, scope);
        return JSON.stringify({
            "clientId": `${aadApp.appId}`,
            "clientSecret": `${aadApp.secret}`,
            "subscriptionId": `${inputs.subscriptionId}`,
            "tenantId": `${inputs.azureSession.tenantId}`,
        });
    }
}
