import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureTreeItem, UserCancelledError } from 'vscode-azureextensionui';
const uuid = require('uuid/v4');
import { AppServiceClient } from './clients/azure/appServiceClient';
import { AzureResourceClient } from './clients/azure/azureResourceClient';
import { Configurer } from './configurers/configurerBase';
import { ConfigurerFactory } from './configurers/configurerFactory';
import { AssetHandler } from './helper/AssetHandler';
import { getSubscriptionSession } from './helper/azureSessionHelper';
import { ControlProvider } from './helper/controlProvider';
import { AzureDevOpsHelper } from './helper/devOps/azureDevOpsHelper';
import { GitHubProvider } from './helper/gitHubHelper';
import { LocalGitRepoHelper } from './helper/LocalGitRepoHelper';
import { RepoAnalysisHelper } from './helper/repoAnalysisHelper';
import { Result, telemetryHelper } from './helper/telemetryHelper';
import * as templateHelper from './helper/templateHelper';
import { TemplateParameterHelper } from './helper/templateParameterHelper';
import { BuildSettings, extensionVariables, GitBranchDetails, GitRepositoryParameters, LanguageSettings, MustacheContext, NodeBuildSettings, ParsedAzureResourceId, PythonBuildSettings, QuickPickItemWithData, RepositoryProvider, SourceOptions, SupportedLanguage, TargetKind, TargetResourceType, WizardInputs } from './model/models';
import { PipelineTemplate, TemplateAssetType } from './model/templateModels';
import * as constants from './resources/constants';
import { Messages } from './resources/messages';
import { TelemetryKeys } from './resources/telemetryKeys';
import { TracePoints } from './resources/tracePoints';

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
    private azureResourceClient: AzureResourceClient;
    private workspacePath: string;
    private controlProvider: ControlProvider;
    private continueOrchestration: boolean = true;

    public constructor() {
        this.inputs = new WizardInputs();
        this.controlProvider = new ControlProvider();
        UniqueResourceNameSuffix = uuid().substr(0, 5);
    }

    public async configure(node: any): Promise<void> {
        telemetryHelper.setCurrentStep('GetAllRequiredInputs');
        await this.getInputs(node);

        if (this.continueOrchestration) {
            let pipelineConfigurer = ConfigurerFactory.GetConfigurer(this.inputs.sourceRepository, this.inputs.azureSession, this.inputs.subscriptionId);
            await pipelineConfigurer.getInputs(this.inputs);

            telemetryHelper.setCurrentStep('CreatePreRequisites');
            await pipelineConfigurer.createPreRequisites(this.inputs, this.azureResourceClient);

            telemetryHelper.setCurrentStep('CreateAssets');
            await new AssetHandler().createAssets(this.inputs.pipelineConfiguration.template.assets, this.inputs, (name: string, type: TemplateAssetType, data: any, inputs: WizardInputs) => { return pipelineConfigurer.createAsset(name, type, data, inputs); });

            telemetryHelper.setCurrentStep('CheckInPipeline');
            await this.checkInPipelineFileToRepository(pipelineConfigurer);

            telemetryHelper.setCurrentStep('CreateAndRunPipeline');
            await pipelineConfigurer.createAndQueuePipeline(this.inputs);

            telemetryHelper.setCurrentStep('PostPipelineCreation');
            // This step should be determined by the resoruce target provider (azure app service, function app, aks) type and pipelineProvider(azure pipeline vs github)
            pipelineConfigurer.executePostPipelineCreationSteps(this.inputs, this.azureResourceClient);

            telemetryHelper.setCurrentStep('DisplayCreatedPipeline');
            pipelineConfigurer.browseQueuedPipeline();
        }
    }

    private async getInputs(node: any): Promise<void> {
        let resourceNode = await this.analyzeNode(node);

        if (this.continueOrchestration) {
            await this.getSourceRepositoryDetails();
            await this.getAzureSession();
            await this.getSelectedPipeline();

            if (this.inputs.pipelineConfiguration.template.label === "Containerized application to AKS") {
                // try to see if node corresponds to any parameter of selected pipeline.
                if (resourceNode) {
                    let resourceParam = TemplateParameterHelper.getMatchingAzureResourceTemplateParameter(resourceNode, this.inputs.pipelineConfiguration.template.parameters);
                    if (resourceParam) {
                        this.inputs.pipelineConfiguration.params[resourceParam.name] = resourceNode;
                    }
                }

                try {
                    let templateParameterHelper = new TemplateParameterHelper();
                    await templateParameterHelper.setParameters(this.inputs.pipelineConfiguration.template.parameters, this.inputs);
                }
                catch (err) {
                    if (err.message === Messages.setupAlreadyConfigured) {
                        this.continueOrchestration = false;
                        return;
                    }
                    else {
                        throw err;
                    }
                }
            }
            else {
                if (!this.inputs.targetResource.resource) {
                    await this.getAzureResourceDetails();
                }
            }
        }
    }

    private async analyzeNode(node: any): Promise<GenericResource> {
        if (!!node && !!node.fullId) {
            return await this.extractAzureResourceFromNode(node);
        }
        else if (node && node.fsPath) {
            this.workspacePath = node.fsPath;
            telemetryHelper.setTelemetry(TelemetryKeys.SourceRepoLocation, SourceOptions.CurrentWorkspace);
        }

        return null;
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
            this.inputs.pipelineConfiguration.workingDirectory = path.relative(gitRootDir, this.workspacePath).split(path.sep).join('/');

            if (this.inputs.pipelineConfiguration.workingDirectory === "") {
                this.inputs.pipelineConfiguration.workingDirectory = ".";
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
        this.inputs.pipelineConfiguration.workingDirectory = '.';
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

                if (remoteUrl.indexOf("bitbucket.org") >= 0) {
                    repositoryProvider = "Bitbucket";
                }
                else if (remoteUrl.indexOf("gitlab.com") >= 0) {
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

    private async extractAzureResourceFromNode(node: AzureTreeItem | any): Promise<GenericResource> {
        let resource: GenericResource = null;
        if (!!node.fullId) {
            this.inputs.subscriptionId = node.root.subscriptionId;
            this.inputs.azureSession = getSubscriptionSession(this.inputs.subscriptionId);
            this.azureResourceClient = new AppServiceClient(this.inputs.azureSession.credentials, this.inputs.azureSession.environment, this.inputs.azureSession.tenantId, this.inputs.subscriptionId);

            try {
                let azureResource: GenericResource = await (this.azureResourceClient as AppServiceClient).getAppServiceResource(node.fullId);
                telemetryHelper.setTelemetry(TelemetryKeys.resourceType, azureResource.type);
                telemetryHelper.setTelemetry(TelemetryKeys.resourceKind, azureResource.kind);
                AzureResourceClient.validateTargetResourceType(azureResource);
                if (azureResource.type.toLowerCase() === TargetResourceType.WebApp.toLowerCase()) {
                    if (await (this.azureResourceClient as AppServiceClient).isScmTypeSet(node.fullId)) {
                        this.continueOrchestration = false;
                        await openBrowseExperience(node.fullId);
                    }
                }

                this.inputs.targetResource.resource = azureResource;
            }
            catch (error) {
                telemetryHelper.logError(Layer, TracePoints.ExtractAzureResourceFromNodeFailed, error);
                throw error;
            }
        }
        else if (!!node.value && node.value.nodeType === 'cluster') {
            this.inputs.subscriptionId = node.value.subscription.subscriptionId;
            this.inputs.azureSession = getSubscriptionSession(this.inputs.subscriptionId);
            this.azureResourceClient = new AzureResourceClient(this.inputs.azureSession.credentials, this.inputs.subscriptionId);
            let cluster = await this.azureResourceClient.getResource(node.value.armId, '2019-08-01');
            telemetryHelper.setTelemetry(TelemetryKeys.resourceType, cluster.type);
            telemetryHelper.setTelemetry(TelemetryKeys.resourceKind, cluster.kind);
            AzureResourceClient.validateTargetResourceType(cluster);
            cluster["parsedResourceId"] = new ParsedAzureResourceId(cluster.id);
        }

        return resource;
    }

    private async getAzureSession(): Promise<void> {
        // show available subscriptions and get the chosen one
        let subscriptionList = extensionVariables.azureAccountExtensionApi.filters.map((subscriptionObject) => {
            return <QuickPickItemWithData>{
                label: `${<string>subscriptionObject.subscription.displayName}`,
                data: subscriptionObject,
                description: `${<string>subscriptionObject.subscription.subscriptionId}`
            };
        });
        let selectedSubscription: QuickPickItemWithData = await this.controlProvider.showQuickPick(constants.SelectSubscription, subscriptionList, { placeHolder: Messages.selectSubscription }, TelemetryKeys.SubscriptionListCount);
        this.inputs.subscriptionId = selectedSubscription.data.subscription.subscriptionId;
        this.inputs.azureSession = getSubscriptionSession(this.inputs.subscriptionId);
    }

    private async getAzureResourceDetails(): Promise<void> {
        // show available resources and get the chosen one
        switch (this.inputs.pipelineConfiguration.template.targetType) {
            case TargetResourceType.None:
                break;
            case TargetResourceType.WebApp:
            default:
                let appServiceClient = new AppServiceClient(this.inputs.azureSession.credentials, this.inputs.azureSession.environment, this.inputs.azureSession.tenantId, this.inputs.subscriptionId);
                let selectedPipelineTemplate = this.inputs.pipelineConfiguration.template;
                let matchingPipelineTemplates = templateHelper.getPipelineTemplatesForAllWebAppKind(this.inputs.sourceRepository.repositoryProvider,
                    selectedPipelineTemplate.label, selectedPipelineTemplate.language, selectedPipelineTemplate.targetKind);

                let webAppKinds = matchingPipelineTemplates.map((template) => template.targetKind);
                let selectedResource: QuickPickItemWithData = await this.controlProvider.showQuickPick(
                    Messages.selectTargetResource,
                    appServiceClient.GetAppServices(webAppKinds)
                        .then((webApps) => webApps.map(x => { return { label: x.name, data: x }; })),
                    { placeHolder: Messages.selectTargetResource },
                    TelemetryKeys.AzureResourceListCount);

                if (await appServiceClient.isScmTypeSet((<GenericResource>selectedResource.data).id)) {
                    this.continueOrchestration = false;
                    await openBrowseExperience((<GenericResource>selectedResource.data).id);
                }
                else {
                    this.inputs.targetResource.resource = selectedResource.data;
                    this.inputs.pipelineConfiguration.template = matchingPipelineTemplates.find((template) => template.targetKind === <TargetKind>this.inputs.targetResource.resource.kind);
                }
        }
    }

    private async getSelectedPipeline(): Promise<void> {
        var repoAnalysisHelper = new RepoAnalysisHelper(this.inputs.azureSession);
        var repoAnalysisResult = await repoAnalysisHelper.getRepositoryAnalysis(this.inputs.sourceRepository);

        let appropriatePipelines: PipelineTemplate[] = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: Messages.analyzingRepo },
            () => templateHelper.analyzeRepoAndListAppropriatePipeline(
                this.inputs.sourceRepository.localPath,
                this.inputs.sourceRepository.repositoryProvider,
                repoAnalysisResult,
                this.inputs.pipelineConfiguration.params[constants.TargetResource])
        );

        // TO:DO- Get applicable pipelines for the repo type and azure target type if target already selected
        if (appropriatePipelines.length > 1) {
            let selectedOption = await this.controlProvider.showQuickPick(
                constants.SelectPipelineTemplate,
                appropriatePipelines.map((pipeline) => { return { label: pipeline.label }; }),
                { placeHolder: Messages.selectPipelineTemplate },
                TelemetryKeys.PipelineTempateListCount);
            this.inputs.pipelineConfiguration.template = appropriatePipelines.find((pipeline) => {
                return pipeline.label === selectedOption.label;
            });

            //Post selecting the template update this.inputs.repoAnalysisParameters with corresponding languageSettings
            if (extensionVariables.enableRepoAnalysis
                && this.inputs.sourceRepository.repositoryProvider === RepositoryProvider.Github
                && !!repoAnalysisResult
                && !!repoAnalysisResult.languageSettingsList) {

                //Get languageSettings (corresponding to language of selected settings) provided by RepoAnalysis
                this.inputs.repoAnalysisParameters = repoAnalysisResult.languageSettingsList.find(languageSettings => {
                    return languageSettings.language === this.inputs.pipelineConfiguration.template.language;
                });
            }

            //If RepoAnalysis is disabled or didn't provided response related to language of selected template
            if(!this.inputs.repoAnalysisParameters){
                this.inputs.repoAnalysisParameters = new LanguageSettings();
                switch (this.inputs.pipelineConfiguration.template.language) {
                    case SupportedLanguage.NODE:
                        this.inputs.repoAnalysisParameters.buildSettings = new NodeBuildSettings();
                        break;
                    case SupportedLanguage.PYTHON:
                        this.inputs.repoAnalysisParameters.buildSettings = new PythonBuildSettings();
                        break;
                    default:
                        this.inputs.repoAnalysisParameters.buildSettings = new BuildSettings();
                }
            }
        }
        else {
            this.inputs.pipelineConfiguration.template = appropriatePipelines[0];
        }

        telemetryHelper.setTelemetry(TelemetryKeys.ChosenTemplate, this.inputs.pipelineConfiguration.template.label);
    }

    private async checkInPipelineFileToRepository(pipelineConfigurer: Configurer): Promise<void> {
        try {
            this.inputs.pipelineConfiguration.filePath = await pipelineConfigurer.getPathToPipelineFile(this.inputs, this.localGitRepoHelper);
            let mustacheContext = new MustacheContext(this.inputs);
            await this.localGitRepoHelper.addContentToFile(
                await templateHelper.renderContent(this.inputs.pipelineConfiguration.template.path, mustacheContext),
                this.inputs.pipelineConfiguration.filePath);
            await vscode.window.showTextDocument(vscode.Uri.file(this.inputs.pipelineConfiguration.filePath));
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

export async function openBrowseExperience(resourceId: string): Promise<void> {
    try {
        // if pipeline is already setup, the ask the user if we should continue.
        telemetryHelper.setTelemetry(TelemetryKeys.PipelineAlreadyConfigured, 'true');

        let browsePipelineAction = await new ControlProvider().showInformationBox(
            constants.SetupAlreadyExists,
            Messages.setupAlreadyConfigured,
            constants.Browse);

        if (browsePipelineAction === constants.Browse) {
            vscode.commands.executeCommand('browse-cicd-pipeline', { fullId: resourceId });
        }
    }
    catch (err) {
        if (!(err instanceof UserCancelledError)) {
            throw err;
        }
    }

    telemetryHelper.setResult(Result.Succeeded);
}
