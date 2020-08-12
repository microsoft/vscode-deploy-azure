import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { ApplicationSettings, RepositoryAnalysis } from 'azureintegration-repoanalysis-client-internal';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureTreeItem, UserCancelledError } from 'vscode-azureextensionui';
import { AppServiceClient } from './clients/azure/appServiceClient';
import { AzureResourceClient } from './clients/azure/azureResourceClient';
import { Configurer } from './configurers/configurerBase';
import { ConfigurerFactory } from './configurers/configurerFactory';
import { RemoteGitHubWorkflowConfigurer } from './configurers/remoteGitHubWorkflowConfigurer';
import { ResourceSelectorFactory } from './configurers/ResourceSelectorFactory';
import { AssetHandler } from './helper/AssetHandler';
import { getAzureSession, getSubscriptionSession } from './helper/azureSessionHelper';
import { ControlProvider } from './helper/controlProvider';
import { AzureDevOpsHelper } from './helper/devOps/azureDevOpsHelper';
import { GitHubProvider } from './helper/gitHubHelper';
import { LocalGitRepoHelper } from './helper/LocalGitRepoHelper';
import { RepoAnalysisHelper } from './helper/repoAnalysisHelper';
import { Result, telemetryHelper } from './helper/telemetryHelper';
import * as templateHelper from './helper/templateHelper';
import { TemplateParameterHelper } from './helper/templateParameterHelper';
import { ConfigurationStage } from './model/Contracts';
import { extensionVariables, GitBranchDetails, GitRepositoryParameters, MustacheContext, ParsedAzureResourceId, QuickPickItemWithData, RepositoryProvider, SourceOptions, StringMap, TargetResourceType, WizardInputs } from './model/models';
import { LocalPipelineTemplate, PipelineTemplate, RemotePipelineTemplate, TemplateAssetType, TemplateType } from './model/templateModels';
import * as constants from './resources/constants';
import { Messages } from './resources/messages';
import { TelemetryKeys } from './resources/telemetryKeys';
import { TracePoints } from './resources/tracePoints';
import { InputControlProvider } from './templateInputHelper/InputControlProvider';

const uuid = require('uuid/v4');

const Layer: string = 'configure';
export let UniqueResourceNameSuffix: string = uuid().substr(0, 5);

export async function configurePipeline(node: AzureTreeItem) {
    await telemetryHelper.executeFunctionWithTimeTelemetry(async () => {
        try {
            if (!(await extensionVariables.azureAccountExtensionApi.waitForLogin())) {
                // set telemetry
                telemetryHelper.setTelemetry(TelemetryKeys.AzureLoginRequired, 'true');

                const loginOption = await vscode.window.showInformationMessage(Messages.azureLoginRequired, Messages.signInLabel, Messages.signUpLabel);
                if (loginOption && loginOption.toLowerCase() === Messages.signInLabel.toLowerCase()) {
                    telemetryHelper.setTelemetry(TelemetryKeys.AzureLoginOption, 'SignIn');
                    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: Messages.waitForAzureSignIn },
                        async () => {
                            await vscode.commands.executeCommand("azure-account.login");
                            await extensionVariables.azureAccountExtensionApi.waitForSubscriptions();
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
                vscode.window.showErrorMessage(error.message);
                extensionVariables.outputChannel.appendLine(error.message);
                if (extensionVariables.isErrorWhitelisted === true) {
                    telemetryHelper.setResult(Result.Succeeded);
                } else {
                    telemetryHelper.setResult(Result.Failed, error);
                }
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
    private context: StringMap<any> = {};

    public constructor() {
        this.inputs = new WizardInputs();
        this.controlProvider = new ControlProvider();
        UniqueResourceNameSuffix = uuid().substr(0, 5);
    }

    public async configure(node: any): Promise<void> {
        telemetryHelper.setCurrentStep('GetAllRequiredInputs');
        await this.getInputs(node);

        if (this.continueOrchestration) {
            let pipelineConfigurer = ConfigurerFactory.GetConfigurer(this.inputs.sourceRepository, this.inputs.azureSession,
                this.inputs.pipelineConfiguration.template.templateType, this.localGitRepoHelper);
            let selectedCICDProvider = (pipelineConfigurer.constructor.name === "AzurePipelineConfigurer") ? constants.azurePipeline : constants.githubWorkflow;
            telemetryHelper.setTelemetry(TelemetryKeys.SelectedCICDProvider, selectedCICDProvider);
            await pipelineConfigurer.getInputs(this.inputs);

            telemetryHelper.setCurrentStep('CreatePreRequisites');
            await pipelineConfigurer.createPreRequisites(this.inputs, !!this.azureResourceClient ? this.azureResourceClient : new AppServiceClient(this.inputs.azureSession.credentials, this.inputs.azureSession.environment, this.inputs.azureSession.tenantId, this.inputs.subscriptionId));

            telemetryHelper.setCurrentStep('CreateAssets');
            if (this.inputs.pipelineConfiguration.template.templateType === TemplateType.REMOTE) {
                await (pipelineConfigurer as RemoteGitHubWorkflowConfigurer).createAssets(ConfigurationStage.Pre);
            } else {
                await new AssetHandler().createAssets((this.inputs.pipelineConfiguration.template as LocalPipelineTemplate).assets, this.inputs, (name: string, assetType: TemplateAssetType, data: any, inputs: WizardInputs) => { return pipelineConfigurer.createAsset(name, assetType, data, inputs); });
            }

            telemetryHelper.setCurrentStep('CheckInPipeline');
            await this.checkInPipelineFileToRepository(pipelineConfigurer);

            telemetryHelper.setCurrentStep('CreateAndRunPipeline');
            await pipelineConfigurer.createAndQueuePipeline(this.inputs);

            telemetryHelper.setCurrentStep('PostPipelineCreation');
            // This step should be determined by the resoruce target provider (azure app service, function app, aks) type and pipelineProvider(azure pipeline vs github)
            pipelineConfigurer.executePostPipelineCreationSteps(this.inputs, this.azureResourceClient ? this.azureResourceClient : new AzureResourceClient(this.inputs.azureSession.credentials, this.inputs.subscriptionId));

            telemetryHelper.setCurrentStep('DisplayCreatedPipeline');
            pipelineConfigurer.browseQueuedPipeline();
        }
    }

    private async getAzureResource(targetType: TargetResourceType) {
        const azureResourceSelector = ResourceSelectorFactory.getAzureResourceSelector(targetType);
        this.inputs.targetResource.resource = await azureResourceSelector.getAzureResource(this.inputs);
        this.azureResourceClient = ResourceSelectorFactory.getAzureResourceClient(targetType, this.inputs.azureSession.credentials,
            this.inputs.azureSession.environment, this.inputs.azureSession.tenantId, this.inputs.subscriptionId);
        telemetryHelper.setTelemetry(TelemetryKeys.resourceType, this.inputs.targetResource.resource.type);
        telemetryHelper.setTelemetry(TelemetryKeys.resourceKind, this.inputs.targetResource.resource.kind);
    }

    private async selectTemplate(resource: GenericResource): Promise<void> {
        switch (resource.type) {
            case TargetResourceType.AKS:
                this.inputs.pipelineConfiguration.template = this.inputs.potentialTemplates.find((template) => template.templateType === TemplateType.LOCAL);
                break;
            case TargetResourceType.WebApp:
                var shortlistedTemplates = [];
                shortlistedTemplates = this.inputs.potentialTemplates.filter((template) => template.targetKind === resource.kind);
                if (!!shortlistedTemplates && shortlistedTemplates.length > 1) {
                    this.inputs.pipelineConfiguration.template = shortlistedTemplates.find((template) => template.templateType === TemplateType.REMOTE);
                }
                else if (!!shortlistedTemplates) {
                    this.inputs.pipelineConfiguration.template = shortlistedTemplates[0];
                }
                else {
                    telemetryHelper.logError(Layer, TracePoints.TemplateNotFound, new Error(Messages.TemplateNotFound + " RepoId: " + this.inputs.sourceRepository.repositoryId));
                    throw new Error(Messages.TemplateNotFound);
                }
                break;

            default:
                throw new Error(Messages.ResourceNotSupported);
        }
    }

    private async getInputs(node: any): Promise<void> {
        let resourceNode = await this.analyzeNode(node);

        if (this.continueOrchestration) {
            await this.getSourceRepositoryDetails();
            if (!this.inputs.azureSession) {
                this.inputs.azureSession = getAzureSession();
            }
            let repoAnalysisResult = await this.getRepositoryAnalysis();
            await this.getSelectedPipeline(repoAnalysisResult);

            try {
                if (!resourceNode) {
                    this.context['rightClickScenario'] = false;
                    await this.getAzureSubscription();
                    await this.getAzureResource(this.getSelectedPipelineTargetType());
                }
                else {
                    this.context['rightClickScenario'] = true;
                }

                if (this.inputs.targetResource.resource && this.inputs.targetResource.resource.id) {
                    this.context['resourceId'] = this.inputs.targetResource.resource.id;
                }
                this.selectTemplate(this.inputs.targetResource.resource);
                telemetryHelper.setTelemetry(TelemetryKeys.SelectedTemplate, this.inputs.pipelineConfiguration.template.label);
                telemetryHelper.setTelemetry(TelemetryKeys.SelectedTemplateType, (this.inputs.pipelineConfiguration.template.templateType).toString());

                await this.updateRepositoryAnalysisApplicationSettings(repoAnalysisResult);

                await this.getTemplateParameters();
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
    }

    private async getTemplateParameters() {
        if (this.inputs.pipelineConfiguration.template.templateType === TemplateType.REMOTE) {
            let template = this.inputs.pipelineConfiguration.template as RemotePipelineTemplate;
            let extendedPipelineTemplate = await templateHelper.getTemplateParameters(this.inputs.azureSession, template.id, this.inputs.githubPATToken);
            template.attributes = extendedPipelineTemplate.attributes;
            template.parameters = extendedPipelineTemplate.parameters;
            let controlProvider = new InputControlProvider(this.inputs.azureSession, extendedPipelineTemplate, this.context);
            this.inputs.pipelineConfiguration.params = await controlProvider.getAllPipelineTemplateInputs();
        }
        else if (this.inputs.pipelineConfiguration.template.targetType === TargetResourceType.AKS) {
            let templateParameterHelper = new TemplateParameterHelper();
            let template = this.inputs.pipelineConfiguration.template as LocalPipelineTemplate;
            await templateParameterHelper.setParameters(template.parameters, this.inputs);
        }
    }

    private async getGithubPatToken(): Promise<void> {
        if (this.inputs.sourceRepository.repositoryProvider === RepositoryProvider.Github) {
            this.inputs.githubPATToken = await this.controlProvider.showInputBox(constants.GitHubPat, {
                placeHolder: Messages.enterGitHubPat,
                prompt: Messages.githubPatTokenHelpMessage,
                validateInput: (inputValue) => {
                    return !inputValue ? Messages.githubPatTokenErrorMessage : null;
                }
            });
        }
    }

    private async getRepositoryAnalysis() {
        if (this.inputs.sourceRepository.repositoryProvider === RepositoryProvider.Github) {
            await this.getGithubPatToken();
            return await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: Messages.AnalyzingRepo },
                () => telemetryHelper.executeFunctionWithTimeTelemetry(async () => {
                    return await new RepoAnalysisHelper(this.inputs.azureSession, this.inputs.githubPATToken).getRepositoryAnalysis(
                        this.inputs.sourceRepository, this.inputs.pipelineConfiguration.workingDirectory.split('/').join('\\'));
                }, TelemetryKeys.RepositoryAnalysisDuration)
            );
        }
        return null;
    }

    private getSelectedPipelineTargetType(): TargetResourceType {
        return this.inputs.potentialTemplates[0].targetType;
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
        telemetryHelper.setTelemetry(TelemetryKeys.RepoId, this.inputs.sourceRepository.repositoryId);
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
            repositoryProvider: vscode.workspace.getConfiguration().get('deployToAzure.UseGithubForCreatingNewRepository') ? RepositoryProvider.Github : RepositoryProvider.AzureRepos,
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
                let repositoryProvider: string;

                if (remoteUrl.indexOf("bitbucket.org") >= 0) {
                    repositoryProvider = "Bitbucket";
                }
                else if (remoteUrl.indexOf("gitlab.com") >= 0) {
                    repositoryProvider = "GitLab";
                }
                else {
                    repositoryProvider = remoteUrl;
                }

                extensionVariables.isErrorWhitelisted = true;
                telemetryHelper.setTelemetry(TelemetryKeys.RepoProvider, repositoryProvider);
                telemetryHelper.setTelemetry(TelemetryKeys.IsErrorWhitelisted, "true");
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

    private async getAzureSubscription(): Promise<void> {
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
        this.context['subscriptionId'] = this.inputs.subscriptionId;
        this.inputs.azureSession = getSubscriptionSession(this.inputs.subscriptionId);
        telemetryHelper.setTelemetry(TelemetryKeys.SubscriptionId, this.inputs.subscriptionId);
    }

    private async getSelectedPipeline(repoAnalysisResult: RepositoryAnalysis): Promise<void> {
        extensionVariables.templateServiceEnabled = true;
        let appropriatePipelines: PipelineTemplate[] = [];

        if (!extensionVariables.templateServiceEnabled) {
            var localPipelines = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: Messages.fetchingTemplates },
                () => templateHelper.analyzeRepoAndListAppropriatePipeline(
                    this.inputs.sourceRepository.localPath,
                    this.inputs.sourceRepository.repositoryProvider,
                    repoAnalysisResult,
                    this.inputs.pipelineConfiguration.params[constants.TargetResource])
            );
            appropriatePipelines = localPipelines;
        } else {
            var remotePipelines: PipelineTemplate[] = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: Messages.fetchingTemplates },
                () => templateHelper.analyzeRepoAndListAppropriatePipeline2(
                    this.inputs.azureSession,
                    this.inputs.sourceRepository.localPath,
                    this.inputs.sourceRepository.repositoryProvider,
                    repoAnalysisResult,
                    this.inputs.githubPATToken)
            );
            appropriatePipelines = remotePipelines;
        }
        let pipelineMap = this.getMapOfUniqueLabels(appropriatePipelines);
        let pipelineLabels = Array.from(pipelineMap.keys());
        if (pipelineLabels.length === 0) {
            telemetryHelper.setTelemetry(TelemetryKeys.UnsupportedLanguage, Messages.languageNotSupported);
            throw new Error(Messages.languageNotSupported);
        }

        // TO:DO- Get applicable pipelines for the repo type and azure target type if target already selected
        if (pipelineLabels.length > 1) {
            var selectedOption = await this.controlProvider.showQuickPick(
                constants.SelectPipelineTemplate,
                pipelineLabels.map((pipeline) => { return { label: pipeline }; }),
                { placeHolder: Messages.selectPipelineTemplate },
                TelemetryKeys.PipelineTempateListCount);
            //only label gets finalized, template isn't final yet
            this.inputs.potentialTemplates = pipelineMap.get(selectedOption.label);
        }
        else {
            this.inputs.potentialTemplates = pipelineMap.get(pipelineLabels[0]);
        }
    }

    private getMapOfUniqueLabels(pipelines: PipelineTemplate[]): Map<string, PipelineTemplate[]> {
        let pipelineMap: Map<string, PipelineTemplate[]> = new Map();
        pipelines.forEach(element => {
            if (pipelineMap.has(element.label)) {
                pipelineMap.get(element.label).push(element);
            }
            else {
                pipelineMap.set(element.label, [element]);
            }
        });
        return pipelineMap;
    }

    private async updateRepositoryAnalysisApplicationSettings(repoAnalysisResult: RepositoryAnalysis): Promise<void> {
        //If RepoAnalysis is disabled or didn't provided response related to language of selected template
        this.inputs.repositoryAnalysisApplicationSettings = {} as ApplicationSettings;

        if (!repoAnalysisResult || !repoAnalysisResult.applicationSettingsList) {
            return;
        }
        let workingDirectories = Array.from(new Set(this.inputs.potentialTemplates
            .filter((template) => template.templateType === TemplateType.REMOTE)
            .map((template: RemotePipelineTemplate) => template.workingDirectory.toLowerCase())));
        var applicationSettings = repoAnalysisResult.applicationSettingsList.filter(applicationSetting => {
            if (this.inputs.pipelineConfiguration.template.templateType === TemplateType.REMOTE) {
                return workingDirectories.indexOf(applicationSetting.settings.workingDirectory.toLowerCase()) >= 0;
            }
            return applicationSetting.language === this.inputs.pipelineConfiguration.template.language;

        });

        this.context['repoAnalysisSettings'] = applicationSettings;

        if (!applicationSettings || applicationSettings.length === 0 ||
            this.inputs.pipelineConfiguration.template.templateType === TemplateType.REMOTE) {
            return;
        }

        if (applicationSettings.length === 1) {
            this.inputs.repositoryAnalysisApplicationSettings = applicationSettings[0];
            this.inputs.pipelineConfiguration.workingDirectory = applicationSettings[0].settings.workingDirectory;
            return;
        }

        let workspacePaths = Array.from(new Set(applicationSettings.map(a => a.settings.workingDirectory)));
        let workspacePathQuickPickItemList: Array<QuickPickItemWithData> = [];
        for (let workspacePath of workspacePaths) {
            workspacePathQuickPickItemList.push({ label: workspacePath, data: workspacePath });
        }
        let selectedWorkspacePathItem = await this.controlProvider.showQuickPick(
            constants.SelectWorkspace,
            workspacePathQuickPickItemList,
            { placeHolder: Messages.selectWorkspace });

        this.inputs.pipelineConfiguration.workingDirectory = selectedWorkspacePathItem.data;
        this.inputs.repositoryAnalysisApplicationSettings =
            repoAnalysisResult.applicationSettingsList.find(applicationSettings => {
                return (applicationSettings.language === this.inputs.pipelineConfiguration.template.language
                    && applicationSettings.settings.workingDirectory === selectedWorkspacePathItem.data);
            });
    }

    private async checkInPipelineFileToRepository(pipelineConfigurer: Configurer): Promise<void> {
        let filesToCommit: string[] = [];
        if (this.inputs.pipelineConfiguration.template.templateType === TemplateType.REMOTE) {
            filesToCommit = await (pipelineConfigurer as RemoteGitHubWorkflowConfigurer).getPipelineFilesToCommit(this.inputs);
        }
        else {
            try {
                let mustacheContext = new MustacheContext(this.inputs);
                if (this.inputs.pipelineConfiguration.template.targetType === TargetResourceType.AKS) {
                    try {
                        await this.localGitRepoHelper.createAndDisplayManifestFile(constants.deploymentManifest, pipelineConfigurer, filesToCommit, this.inputs);
                        var properties = this.inputs.pipelineConfiguration.params.aksCluster.properties;
                        if (properties.addonProfiles && properties.addonProfiles.httpApplicationRouting && properties.addonProfiles.httpApplicationRouting.enabled) {
                            await this.localGitRepoHelper.createAndDisplayManifestFile(constants.serviceIngressManifest, pipelineConfigurer, filesToCommit, this.inputs, constants.serviceManifest);
                            await this.localGitRepoHelper.createAndDisplayManifestFile(constants.ingressManifest, pipelineConfigurer, filesToCommit, this.inputs);
                        }
                        else {
                            await this.localGitRepoHelper.createAndDisplayManifestFile(constants.serviceManifest, pipelineConfigurer, filesToCommit, this.inputs);
                        }
                    }
                    catch (error) {
                        telemetryHelper.logError(Layer, TracePoints.CreatingManifestsFailed, error);
                        throw error;
                    }
                }

                this.inputs.pipelineConfiguration.filePath = await pipelineConfigurer.getPathToPipelineFile(this.inputs, this.localGitRepoHelper);
                filesToCommit.push(this.inputs.pipelineConfiguration.filePath);
                await this.localGitRepoHelper.addContentToFile(
                    await templateHelper.renderContent((this.inputs.pipelineConfiguration.template as LocalPipelineTemplate).path, mustacheContext),
                    this.inputs.pipelineConfiguration.filePath);
                await vscode.window.showTextDocument(vscode.Uri.file(this.inputs.pipelineConfiguration.filePath));
                telemetryHelper.setTelemetry(TelemetryKeys.DisplayWorkflow, 'true');
            }
            catch (error) {
                telemetryHelper.logError(Layer, TracePoints.AddingContentToPipelineFileFailed, error);
                throw error;
            }
        }

        try {
            await pipelineConfigurer.checkInPipelineFilesToRepository(filesToCommit, this.inputs, this.localGitRepoHelper);
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
