import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureTreeItem, UserCancelledError } from 'vscode-azureextensionui';
import { AppServiceClient } from './clients/azure/appServiceClient';
import { AzureResourceClient } from './clients/azure/azureResourceClient';
import { Configurer } from './configurers/configurerBase';
import { ConfigurerFactory } from './configurers/configurerFactory';
import { ResourceSelectorFactory } from './configurers/ResourceSelectorFactory';
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
import { extensionVariables, GitBranchDetails, GitRepositoryParameters, MustacheContext, ParsedAzureResourceId, QuickPickItemWithData, RepositoryAnalysisApplicationSettings, RepositoryAnalysisParameters, RepositoryProvider, SourceOptions, TargetKind, TargetResourceType, WizardInputs } from './model/models';
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
    private _repoAnalysisSettings: RepositoryAnalysisApplicationSettings[];

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
            let selectedCICDProvider = (pipelineConfigurer.constructor.name === "GitHubWorkflowConfigurer") ? constants.githubWorkflow : constants.azurePipeline;
            telemetryHelper.setTelemetry(TelemetryKeys.SelectedCICDProvider, selectedCICDProvider);
            await pipelineConfigurer.getInputs(this.inputs);

            telemetryHelper.setCurrentStep('CreatePreRequisites');
            await pipelineConfigurer.createPreRequisites(this.inputs, !!this.azureResourceClient ? this.azureResourceClient : new AppServiceClient(this.inputs.azureSession.credentials, this.inputs.azureSession.environment, this.inputs.azureSession.tenantId, this.inputs.subscriptionId));

            telemetryHelper.setCurrentStep('CreateAssets');
            await new AssetHandler().createAssets((this.inputs.pipelineConfiguration.template as LocalPipelineTemplate).assets, this.inputs, (name: string, type: TemplateAssetType, data: any, inputs: WizardInputs) => { return pipelineConfigurer.createAsset(name, type, data, inputs); });

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

    private async getAzureResource() {
        var azureResourceSelector = ResourceSelectorFactory.getAzureResourceSelector(this.inputs.pipelineConfiguration);
        this.inputs.targetResource.resource = await azureResourceSelector.getAzureResource(this.inputs);
    }

    private async selectTemplate(resource: GenericResource): Promise<void> {
        switch (resource.type) {
            case TargetResourceType.AKS:
                this.inputs.pipelineConfiguration.template = this.inputs.potentialTemplates.find((template) => template.templateType === TemplateType.local);
                break;
            case TargetResourceType.WebApp:
                var shortlistedTemplates = [];
                shortlistedTemplates = this.inputs.potentialTemplates.filter((template) => template.targetKind === resource.kind);
                if (shortlistedTemplates.length > 1) {
                    this.inputs.pipelineConfiguration.template = shortlistedTemplates.find((template) => template.templateType === TemplateType.remote);
                }
                else {
                    this.inputs.pipelineConfiguration.template = shortlistedTemplates[0];
                }
                break;

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

    private async getInputs(node: any): Promise<void> {
        let resourceNode = await this.analyzeNode(node);

        if (this.continueOrchestration) {
            await this.getSourceRepositoryDetails();
            await this.getAzureSession();
            let repoAnalysisResult = await this.getRepositoryAnalysis();
            await this.getSelectedPipeline(repoAnalysisResult);

            try {
                if (!resourceNode) {
                    await this.getAzureResource();
                }
                this.selectTemplate(this.inputs.targetResource.resource);

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
        if (this.inputs.pipelineConfiguration.template.templateType === TemplateType.remote) {
            let extendedPipelineTemplate = await templateHelper.getTemplateParameteres(this.inputs.azureSession, this.inputs.pipelineConfiguration.template as RemotePipelineTemplate);
            let context: { [key: string]: any } = {};
            context['subscriptionId'] = this.inputs.subscriptionId;
            let controlProvider = new InputControlProvider(extendedPipelineTemplate, this._repoAnalysisSettings, context);
            this.inputs.pipelineConfiguration.parameters = await controlProvider.getAllPipelineTemplateInputs(this.inputs.azureSession);
        }
        else if (this.inputs.pipelineConfiguration.template.targetType === TargetResourceType.AKS) {
            let templateParameterHelper = new TemplateParameterHelper();
            let template = this.inputs.potentialTemplates[0] as LocalPipelineTemplate;
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
            return await new RepoAnalysisHelper(this.inputs.azureSession, this.inputs.githubPATToken).getRepositoryAnalysis(
                this.inputs.sourceRepository, this.inputs.pipelineConfiguration.workingDirectory.split('/').join('\\'));
        }
        return null;
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

        telemetryHelper.setTelemetry(TelemetryKeys.SubscriptionId, this.inputs.subscriptionId);
    }

    private async getSelectedPipeline(repoAnalysisResult: RepositoryAnalysisParameters): Promise<void> {
        extensionVariables.templateServiceEnabled = true;
        var appropriatePipelines: PipelineTemplate[] = [];

        if (!extensionVariables.templateServiceEnabled) {
            var localPipelines = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: Messages.analyzingRepo },
                () => templateHelper.analyzeRepoAndListAppropriatePipeline(
                    this.inputs.sourceRepository.localPath,
                    this.inputs.sourceRepository.repositoryProvider,
                    repoAnalysisResult,
                    this.inputs.pipelineConfiguration.params[constants.TargetResource])
            );
            appropriatePipelines = localPipelines;
        } else {
            var remotePipelines: PipelineTemplate[] = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: Messages.analyzingRepo },
                () => templateHelper.analyzeRepoAndListAppropriatePipeline2(
                    this.inputs.azureSession,
                    this.inputs.sourceRepository.localPath,
                    this.inputs.sourceRepository.repositoryProvider,
                    repoAnalysisResult,
                    this.inputs.pipelineConfiguration.params[constants.TargetResource])
            );
            appropriatePipelines = remotePipelines;
        }

        let pipelineMap: Map<string, PipelineTemplate[]> = new Map();

        appropriatePipelines.forEach(element => {
            if (pipelineMap.has(element.label)) {
                pipelineMap.get(element.label).push(element);
            }
            else {
                pipelineMap.set(element.label, [element]);
            }
        });

        let pipelineLabels = Array.from(pipelineMap.keys());

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
        this.inputs.pipelineConfiguration.template = this.inputs.potentialTemplates[0];

        telemetryHelper.setTelemetry(TelemetryKeys.ChosenTemplate, this.inputs.pipelineConfiguration.template.label);
    }

    private async updateRepositoryAnalysisApplicationSettings(repoAnalysisResult: RepositoryAnalysisParameters): Promise<void> {
        //If RepoAnalysis is disabled or didn't provided response related to language of selected template
        this.inputs.repositoryAnalysisApplicationSettings = new RepositoryAnalysisApplicationSettings();

        if (!repoAnalysisResult || !repoAnalysisResult.applicationSettingsList) {
            return;
        }
        var applicationSettings = repoAnalysisResult.applicationSettingsList.filter(applicationSetting => {
            if (this.inputs.pipelineConfiguration.template.templateType === TemplateType.remote) {
                const template = this.inputs.pipelineConfiguration.template as RemotePipelineTemplate;
                if (applicationSetting.language && applicationSetting.language !== template.attributes.language.toLowerCase()) {
                    return false;
                }
                if (applicationSetting.buildTargetName && applicationSetting.buildTargetName !== template.attributes.buildTarget.toLowerCase()) {
                    return false;
                }
                if (applicationSetting.deployTargetName && applicationSetting.deployTargetName !== template.attributes.deployTarget.toLowerCase()) {
                    return false;
                }
                return true;
            }
            return applicationSetting.language === this.inputs.pipelineConfiguration.template.language;

        });

        if (!applicationSettings || applicationSettings.length === 0) {
            return;
        }
        this._repoAnalysisSettings = applicationSettings;
        if (applicationSettings.length === 1) {
            this.inputs.repositoryAnalysisApplicationSettings = applicationSettings[0];
            this.inputs.pipelineConfiguration.workingDirectory = applicationSettings[0].settings.workingDirectory;
            return;
        }

        if (this.inputs.pipelineConfiguration.template.templateType === TemplateType.remote) {
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
