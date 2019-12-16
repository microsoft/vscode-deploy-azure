const uuid = require('uuid/v4');
import { AppServiceClient } from './clients/azure/appServiceClient';
import { AzureDevOpsHelper } from './helper/devOps/azureDevOpsHelper';
import { AzureTreeItem, UserCancelledError } from 'vscode-azureextensionui';
import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { LocalGitRepoHelper } from './helper/LocalGitRepoHelper';
import { Messages } from './resources/messages';
import { SourceOptions, RepositoryProvider, extensionVariables, WizardInputs, WebAppKind, PipelineTemplate, QuickPickItemWithData, GitRepositoryParameters, GitBranchDetails, TargetResourceType } from './model/models';
import { TracePoints } from './resources/tracePoints';
import { TelemetryKeys } from './resources/telemetryKeys';
import * as constants from './resources/constants';
import * as path from 'path';
import * as templateHelper from './helper/templateHelper';
import * as vscode from 'vscode';
import { Result, telemetryHelper } from './helper/telemetryHelper';
import { ControlProvider } from './helper/controlProvider';
import { GitHubProvider } from './helper/gitHubHelper';
import { getSubscriptionSession } from './helper/azureSessionHelper';
import { AzureResourceClient } from './clients/azure/azureResourceClient';
import { Configurer } from './configurers/configurerBase';
import { ConfigurerFactory } from './configurers/configurerFactory';

const Layer: string = 'configure';
export let UniqueResourceNameSuffix: string = uuid().substr(0, 5);

export async function configurePipeline(node: AzureTreeItem) {
    await telemetryHelper.executeFunctionWithTimeTelemetry(async () => {
        try {
            if (!(await extensionVariables.azureAccountExtensionApi.waitForLogin())) {
                // set telemetry
                telemetryHelper.setTelemetry(TelemetryKeys.AzureLoginRequired, 'true');

                let loginOption = await vscode.window.showInformationMessage(Messages.azureLoginRequired, Messages.signInLabel, Messages.signUpLabel);
                if (loginOption && loginOption.toLowerCase() === Messages.signInLabel.toLowerCase()) {
                    telemetryHelper.setTelemetry(TelemetryKeys.AzureLoginOption, 'SignIn');
                    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: Messages.waitForAzureSignIn },
                        async () => {
                            await vscode.commands.executeCommand("azure-account.login");
                        });
                }
                else if (loginOption && loginOption.toLowerCase() === Messages.signUpLabel.toLowerCase()) {
                    telemetryHelper.setTelemetry(TelemetryKeys.AzureLoginOption, 'SignUp');
                    await vscode.commands.executeCommand("azure-account.createAccount");
                    return;
                }
                else {
                    let error = new UserCancelledError(Messages.azureLoginRequired);
                    throw error;
                }
            }

            var orchestrator = new Orchestrator();
            await orchestrator.configure(node);
        }
        catch (error) {
            if (!(error instanceof UserCancelledError)) {
                extensionVariables.outputChannel.appendLine(error.message);
                vscode.window.showErrorMessage(error.message);
                telemetryHelper.setResult(Result.Failed, error);
            }
            else {
                telemetryHelper.setResult(Result.Canceled, error);
            }
        }
    }, TelemetryKeys.CommandExecutionDuration);
}

class Orchestrator {
    private inputs: WizardInputs;
    private localGitRepoHelper: LocalGitRepoHelper;
    private appServiceClient: AppServiceClient;
    private workspacePath: string;
    private controlProvider: ControlProvider;
    private continueOrchestration: boolean = true;

    public constructor() {
        this.inputs = new WizardInputs();
        this.controlProvider = new ControlProvider();
        UniqueResourceNameSuffix = uuid().substr(0, 5);
    }

    public async configure(node: any) {
        telemetryHelper.setCurrentStep('GetAllRequiredInputs');
        await this.getInputs(node);

        if (this.continueOrchestration) {
            let pipelineConfigurer = ConfigurerFactory.GetConfigurer(this.inputs.sourceRepository, this.inputs.azureSession, this.inputs.targetResource.subscriptionId);
            await pipelineConfigurer.getInputs(this.inputs);

            telemetryHelper.setCurrentStep('CreatePreRequisites');
            await pipelineConfigurer.createPreRequisites(this.inputs);

            telemetryHelper.setCurrentStep('CheckInPipeline');
            await this.checkInPipelineFileToRepository(pipelineConfigurer);

            telemetryHelper.setCurrentStep('CreateAndRunPipeline');
            await pipelineConfigurer.createAndQueuePipeline(this.inputs);

            telemetryHelper.setCurrentStep('PostPipelineCreation');
            // This step should be determined by the resoruce target provider (azure app service, function app, aks) type and pipelineProvider(azure pipeline vs github)
            pipelineConfigurer.executePostPipelineCreationSteps(this.inputs, this.appServiceClient);

            telemetryHelper.setCurrentStep('DisplayCreatedPipeline');
            pipelineConfigurer.browseQueuedPipeline();
        }
    }

    private async getInputs(node: any): Promise<void> {
        await this.analyzeNode(node);

        if (this.continueOrchestration) {
            await this.getSourceRepositoryDetails();
            await this.getSelectedPipeline();

            if (!this.inputs.targetResource.resource) {
                await this.getAzureResourceDetails();
            }
        }
    }

    private async analyzeNode(node: any): Promise<void> {
        if (!!node && !!node.fullId) {
            await this.extractAzureResourceFromNode(node);
        }
        else if (node && node.fsPath) {
            this.workspacePath = node.fsPath;
            telemetryHelper.setTelemetry(TelemetryKeys.SourceRepoLocation, SourceOptions.CurrentWorkspace);
        }
    }

    private async getSourceRepositoryDetails(): Promise<void> {
        try {
            if (!this.workspacePath) { // This is to handle when we have already identified the repository details.
                await this.setWorkspace();
            }

            await this.getGitDetailsFromRepository();
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.GetSourceRepositoryDetailsFailed, error);
            throw error;
        }
    }

    private async setWorkspace(): Promise<void> {
        let workspaceFolders = vscode.workspace && vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            telemetryHelper.setTelemetry(TelemetryKeys.SourceRepoLocation, SourceOptions.CurrentWorkspace);

            if (workspaceFolders.length === 1) {
                telemetryHelper.setTelemetry(TelemetryKeys.MultipleWorkspaceFolders, 'false');
                this.workspacePath = workspaceFolders[0].uri.fsPath;
            }
            else {
                telemetryHelper.setTelemetry(TelemetryKeys.MultipleWorkspaceFolders, 'true');
                let workspaceFolderOptions: Array<QuickPickItemWithData> = [];
                for (let folder of workspaceFolders) {
                    workspaceFolderOptions.push({ label: folder.name, data: folder });
                }
                let selectedWorkspaceFolder = await this.controlProvider.showQuickPick(
                    constants.SelectFromMultipleWorkSpace,
                    workspaceFolderOptions,
                    { placeHolder: Messages.selectWorkspaceFolder });
                this.workspacePath = selectedWorkspaceFolder.data.uri.fsPath;
            }
        }
        else {
            telemetryHelper.setTelemetry(TelemetryKeys.SourceRepoLocation, SourceOptions.BrowseLocalMachine);
            let selectedFolder: vscode.Uri[] = await vscode.window.showOpenDialog(
                {
                    openLabel: Messages.selectFolderLabel,
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                }
            );
            if (selectedFolder && selectedFolder.length > 0) {
                this.workspacePath = selectedFolder[0].fsPath;
            }
            else {
                throw new UserCancelledError(Messages.noWorkSpaceSelectedError);
            }
        }
    }

    private async getGitDetailsFromRepository(): Promise<void> {
        this.localGitRepoHelper = LocalGitRepoHelper.GetHelperInstance(this.workspacePath);
        let isGitRepository = await this.localGitRepoHelper.isGitRepository();

        if (isGitRepository) {
            let gitBranchDetails = await this.localGitRepoHelper.getGitBranchDetails();

            if (!gitBranchDetails.remoteName) {
                // Remote tracking branch is not set
                let remotes = await this.localGitRepoHelper.getGitRemotes();
                if (remotes.length === 0) {
                    this.setDefaultRepositoryDetails();
                }
                else if (remotes.length === 1) {
                    gitBranchDetails.remoteName = remotes[0].name;
                }
                else {
                    // Show an option to user to select remote to be configured
                    let selectedRemote = await this.controlProvider.showQuickPick(
                        constants.SelectRemoteForRepo,
                        remotes.map(remote => { return { label: remote.name }; }),
                        { placeHolder: Messages.selectRemoteForBranch });
                    gitBranchDetails.remoteName = selectedRemote.label;
                }
            }

            // Set working directory relative to repository root
            let gitRootDir = await this.localGitRepoHelper.getGitRootDirectory();
            this.inputs.pipelineParameters.workingDirectory = path.relative(gitRootDir, this.workspacePath).split(path.sep).join('/');

            if(this.inputs.pipelineParameters.workingDirectory == "") {
                this.inputs.pipelineParameters.workingDirectory = ".";
            }

            this.inputs.sourceRepository = this.inputs.sourceRepository ? this.inputs.sourceRepository : await this.getGitRepositoryParameters(gitBranchDetails);
        }
        else {
            this.setDefaultRepositoryDetails();
        }
        // set telemetry
        telemetryHelper.setTelemetry(TelemetryKeys.RepoProvider, this.inputs.sourceRepository.repositoryProvider);
    }

    private setDefaultRepositoryDetails(): void {
        this.inputs.pipelineParameters.workingDirectory = '.';
        this.inputs.sourceRepository = {
            branch: 'master',
            commitId: '',
            localPath: this.workspacePath,
            remoteName: 'origin',
            remoteUrl: '',
            repositoryId: '',
            repositoryName: '',
            repositoryProvider: RepositoryProvider.AzureRepos
        };
    }

    private async getGitRepositoryParameters(gitRepositoryDetails: GitBranchDetails): Promise<GitRepositoryParameters> {
        let remoteUrl = await this.localGitRepoHelper.getGitRemoteUrl(gitRepositoryDetails.remoteName);

        if (remoteUrl) {
            if (AzureDevOpsHelper.isAzureReposUrl(remoteUrl)) {
                return <GitRepositoryParameters>{
                    repositoryProvider: RepositoryProvider.AzureRepos,
                    repositoryId: "",
                    repositoryName: AzureDevOpsHelper.getRepositoryDetailsFromRemoteUrl(remoteUrl).repositoryName,
                    remoteName: gitRepositoryDetails.remoteName,
                    remoteUrl: remoteUrl,
                    branch: gitRepositoryDetails.branch,
                    commitId: "",
                    localPath: this.workspacePath
                };
            }
            else if (GitHubProvider.isGitHubUrl(remoteUrl)) {
                let repoId = GitHubProvider.getRepositoryIdFromUrl(remoteUrl);
                return <GitRepositoryParameters>{
                    repositoryProvider: RepositoryProvider.Github,
                    repositoryId: repoId,
                    repositoryName: repoId,
                    remoteName: gitRepositoryDetails.remoteName,
                    remoteUrl: remoteUrl,
                    branch: gitRepositoryDetails.branch,
                    commitId: "",
                    localPath: this.workspacePath
                };
            }
            else {
                let repositoryProvider: string = "Other";

                if(remoteUrl.indexOf("bitbucket.org") >= 0) {
                    repositoryProvider = "Bitbucket";
                }
                else if(remoteUrl.indexOf("gitlab.com") >= 0) {
                    repositoryProvider = "GitLab";
                }

                telemetryHelper.setTelemetry(TelemetryKeys.RepoProvider, repositoryProvider);
                throw new Error(Messages.cannotIdentifyRespositoryDetails);
            }
        }
        else {
            throw new Error(Messages.remoteRepositoryNotConfigured);
        }
    }

    private async extractAzureResourceFromNode(node: AzureTreeItem): Promise<void> {
        this.inputs.targetResource.subscriptionId = node.root.subscriptionId;
        this.inputs.azureSession = getSubscriptionSession(this.inputs.targetResource.subscriptionId);
        this.appServiceClient = new AppServiceClient(this.inputs.azureSession.credentials, this.inputs.azureSession.environment, this.inputs.azureSession.tenantId, this.inputs.targetResource.subscriptionId);

        try {
            let azureResource: GenericResource = await this.appServiceClient.getAppServiceResource(node.fullId);
            telemetryHelper.setTelemetry(TelemetryKeys.resourceType, azureResource.type);
            telemetryHelper.setTelemetry(TelemetryKeys.resourceKind, azureResource.kind);
            AzureResourceClient.validateTargetResourceType(azureResource);
            if (azureResource.type.toLowerCase() === TargetResourceType.WebApp.toLowerCase()) {
                if (await this.appServiceClient.isScmTypeSet(node.fullId)) {
                    await this.openBrowseExperience(node.fullId);
                }
            }

            this.inputs.targetResource.resource = azureResource;
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.ExtractAzureResourceFromNodeFailed, error);
            throw error;
        }
    }

    private async openBrowseExperience(resourceId: string): Promise<void> {
        try {
            // if pipeline is already setup, the ask the user if we should continue.
            telemetryHelper.setTelemetry(TelemetryKeys.PipelineAlreadyConfigured, 'true');

            let browsePipelineAction = await this.controlProvider.showInformationBox(
            constants.SetupAlreadyExists,
            Messages.setupAlreadyConfigured,
            constants.Browse);

            if (browsePipelineAction) {
                vscode.commands.executeCommand('browse-cicd-pipeline', { fullId: resourceId });
            }
        }
        catch (err) {
            if (!(err instanceof UserCancelledError)) {
                throw err;
            }
        }

        this.continueOrchestration = false;
        telemetryHelper.setResult(Result.Succeeded);
    }

    private async getSelectedPipeline(): Promise<void> {
        let appropriatePipelines: PipelineTemplate[] = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: Messages.analyzingRepo },
            () => templateHelper.analyzeRepoAndListAppropriatePipeline(
                this.inputs.sourceRepository.localPath,
                this.inputs.sourceRepository.repositoryProvider,
                this.inputs.targetResource.resource)
        );

        // TO:DO- Get applicable pipelines for the repo type and azure target type if target already selected
        if (appropriatePipelines.length > 1) {
            let selectedOption = await this.controlProvider.showQuickPick(
                constants.SelectPipelineTemplate,
                appropriatePipelines.map((pipeline) => { return { label: pipeline.label }; }),
                { placeHolder: Messages.selectPipelineTemplate },
                TelemetryKeys.PipelineTempateListCount);
            this.inputs.pipelineParameters.pipelineTemplate = appropriatePipelines.find((pipeline) => {
                return pipeline.label === selectedOption.label;
            });
        }
        else {
            this.inputs.pipelineParameters.pipelineTemplate = appropriatePipelines[0];
        }

        telemetryHelper.setTelemetry(TelemetryKeys.ChosenTemplate, this.inputs.pipelineParameters.pipelineTemplate.label);
    }

    private async getAzureResourceDetails(): Promise<void> {
        // show available subscriptions and get the chosen one
        let subscriptionList = extensionVariables.azureAccountExtensionApi.filters.map((subscriptionObject) => {
            return <QuickPickItemWithData>{
                label: `${<string>subscriptionObject.subscription.displayName}`,
                data: subscriptionObject,
                description: `${<string>subscriptionObject.subscription.subscriptionId}`
            };
        });
        let selectedSubscription: QuickPickItemWithData = await this.controlProvider.showQuickPick(constants.SelectSubscription, subscriptionList, { placeHolder: Messages.selectSubscription });
        this.inputs.targetResource.subscriptionId = selectedSubscription.data.subscription.subscriptionId;
        this.inputs.azureSession = getSubscriptionSession(this.inputs.targetResource.subscriptionId);

        // show available resources and get the chosen one
        switch(this.inputs.pipelineParameters.pipelineTemplate.targetType) {
            case TargetResourceType.None:
                break;
            case TargetResourceType.WebApp:
            default:
                this.appServiceClient = new AppServiceClient(this.inputs.azureSession.credentials, this.inputs.azureSession.environment, this.inputs.azureSession.tenantId, this.inputs.targetResource.subscriptionId);

                let webAppKind = [];
                if ((this.inputs.pipelineParameters.pipelineTemplate.targetKind === WebAppKind.WindowsApp || this.inputs.pipelineParameters.pipelineTemplate.targetKind === WebAppKind.LinuxApp) && this.inputs.pipelineParameters.pipelineTemplate.label.toLowerCase().endsWith('to app service')) {
                    webAppKind.push(WebAppKind.WindowsApp, WebAppKind.LinuxApp);
                }
                else if ((this.inputs.pipelineParameters.pipelineTemplate.targetKind === WebAppKind.FunctionApp || this.inputs.pipelineParameters.pipelineTemplate.targetKind === WebAppKind.FunctionAppLinux) && this.inputs.pipelineParameters.pipelineTemplate.label.toLowerCase().endsWith('to Azure Function')) {
                    webAppKind.push(WebAppKind.FunctionApp, WebAppKind.FunctionAppLinux, WebAppKind.FunctionAppLinuxContainer);
                }
                else {
                    webAppKind.push(this.inputs.pipelineParameters.pipelineTemplate.targetKind);
                }

                let selectedResource: QuickPickItemWithData = await this.controlProvider.showQuickPick(
                    Messages.selectTargetResource,
                    this.appServiceClient.GetAppServices(webAppKind)
                        .then((webApps) => webApps.map(x => { return { label: x.name, data: x }; })),
                    { placeHolder: Messages.selectTargetResource },
                    TelemetryKeys.WebAppListCount);

                if (await this.appServiceClient.isScmTypeSet((<GenericResource>selectedResource.data).id)) {
                    await this.openBrowseExperience((<GenericResource>selectedResource.data).id);
                }
                else {
                    this.inputs.targetResource.resource = selectedResource.data;
                    this.inputs.pipelineParameters.pipelineTemplate = templateHelper.getTemplate(
                        this.inputs.sourceRepository.repositoryProvider,
                        this.inputs.pipelineParameters.pipelineTemplate.language,
                        TargetResourceType.WebApp,
                        <WebAppKind>this.inputs.targetResource.resource.kind);
                }
        }
    }

    private async checkInPipelineFileToRepository(pipelineConfigurer: Configurer): Promise<void> {
        try {
            this.inputs.pipelineParameters.pipelineFilePath = await pipelineConfigurer.getPathToPipelineFile(this.inputs, this.localGitRepoHelper);
            await this.localGitRepoHelper.addContentToFile(
                await templateHelper.renderContent(this.inputs.pipelineParameters.pipelineTemplate.path, this.inputs),
                this.inputs.pipelineParameters.pipelineFilePath);
            await vscode.window.showTextDocument(vscode.Uri.file(this.inputs.pipelineParameters.pipelineFilePath));
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.AddingContentToPipelineFileFailed, error);
            throw error;
        }

        try {
            await pipelineConfigurer.checkInPipelineFileToRepository(this.inputs, this.localGitRepoHelper);
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.PipelineFileCheckInFailed, error);
            throw error;
        }
    }
}

// this method is called when your extension is deactivated
export function deactivate() { }
