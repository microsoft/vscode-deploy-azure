import { SubscriptionModels } from 'azure-arm-resource';
import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { ServiceClientCredentials } from 'ms-rest';
import { AzureEnvironment } from 'ms-rest-azure';
import { ExtensionContext, OutputChannel, QuickPickItem, workspace } from 'vscode';
import { IAzureUserInput, ITelemetryReporter, UIExtensionVariables } from 'vscode-azureextensionui';
import { Messages } from '../resources/messages';
import { PipelineTemplate, PipelineTemplateMetadata } from './templateModels';

class ExtensionVariables implements UIExtensionVariables {
    public azureAccountExtensionApi: AzureAccountExtensionExports;
    public context: ExtensionContext;
    public outputChannel: OutputChannel;
    public reporter: ITelemetryReporter;
    public ui: IAzureUserInput;
    public enableGitHubWorkflow: boolean;
    public templateServiceEnabled: boolean;

    constructor() {
        this.enableGitHubWorkflow = !workspace.getConfiguration().get('deployToAzure.UseAzurePipelinesForGithub');
    }
}

let extensionVariables = new ExtensionVariables();
export { extensionVariables };

export class WizardInputs {
    organizationName: string;
    project: DevOpsProject;
    isNewOrganization: boolean;
    sourceRepository: GitRepositoryParameters;
    targetResource: AzureParameters = new AzureParameters();
    repositoryAnalysisApplicationSettings: RepositoryAnalysisApplicationSettings;
    pipelineConfiguration: PipelineConfiguration = new PipelineConfiguration();
    azureSession: AzureSession;
    subscriptionId: string;
    githubPATToken?: string;
}

export class RepositoryAnalysisParameters {
    repositoryAnalysisApplicationSettingsList: RepositoryAnalysisApplicationSettings[];
}

//VS Code side model to extract information in any format from RepoAnalysis service result.
export class RepositoryAnalysisApplicationSettings {
    language: SupportedLanguage;
    buildTargetName: string;
    deployTargetName: string;
    settings: BuildAndDeploySettings = new BuildAndDeploySettings();
}

export class BuildAndDeploySettings {
    nodeGulpFilePath?: string = "gulpfile.js";
    nodeGruntFilePath?: string = "gruntfile.js";
    nodePackageFilePath?: string = "package.json";
    nodePackageFileDirectory?: string = ".";
    pythonRequirementsFilePath?: string = "requirements.txt";
    pythonRequirementsFileDirectory?: string = ".";
    azureFunctionsHostFilePath?: string = "host.json";
    azureFunctionsHostFileDirectory?: string = ".";
}

export class AzureParameters {
    resource: GenericResource;
    serviceConnectionId: string;
}

export class Organization {
    accountId: string;
    accountName: string;
    accountUri: string;
    properties: {};
    isMSAOrg: boolean;
}

export class AzureSession {
    environment: AzureEnvironment;
    userId: string;
    tenantId: string;
    credentials: ServiceClientCredentials;
}

export class PipelineConfiguration {
    filePath: string;
    template: PipelineTemplate;
    templateInfo: PipelineTemplateMetadata;
    workingDirectory: string;
    params: { [key: string]: any } = {};
    assets: { [key: string]: any } = {};
}

export class MustacheContext {
    constructor(inputs: WizardInputs) {
        this.inputs = inputs.pipelineConfiguration.params;
        this.assets = inputs.pipelineConfiguration.assets;
        this.workingDirectory = inputs.pipelineConfiguration.workingDirectory;
        this.sourceRepository = inputs.sourceRepository;
        this.targetResource = inputs.targetResource;
        this.repositoryAnalysisApplicationSettings = inputs.repositoryAnalysisApplicationSettings;
    }

    inputs: { [key: string]: any } = {};
    assets: { [key: string]: any } = {};
    // we also need to remove working directory and make it an explicit parameter of template, which will be present as part of inputs.
    workingDirectory: string;
    // the below two properties will be removed during transition to parameterized templates.
    sourceRepository: GitRepositoryParameters;
    targetResource: AzureParameters;
    repositoryAnalysisApplicationSettings: RepositoryAnalysisApplicationSettings;
}

export class QuickPickItemWithData implements QuickPickItem {
    label: string;
    data: any;
    description?: string;
    detail?: string;
}

export class ParsedAzureResourceId {
    public resourceId: string;
    public subscriptionId: string;
    public resourceGroup: string;
    public resourceType: string;
    public resourceProvider: string;
    public resourceName: string;
    public childResourceType?: string;
    public childResource?: string;

    constructor(resourceId: string) {
        if (!resourceId) {
            throw new Error(Messages.resourceIdMissing);
        }

        this.resourceId = resourceId;
        this.parseId();
    }

    private parseId() {
        // remove all empty parts in the resource to avoid failing in case there are leading/trailing/extra '/'
        let parts = this.resourceId.split('/').filter((part) => !!part);
        if (!!parts) {
            for (let i = 0; i < parts.length; i++) {
                switch (i) {
                    case 1:
                        this.subscriptionId = parts[i];
                        break;
                    case 3:
                        this.resourceGroup = parts[i];
                        break;
                    case 5:
                        this.resourceProvider = parts[i];
                        break;
                    case 6:
                        this.resourceType = parts[i];
                        break;
                    case 7:
                        this.resourceName = parts[i];
                        break;
                    case 8:
                        this.childResourceType = parts[i];
                        break;
                    case 9:
                        this.childResource = parts[i];
                        break;
                }
            }
        }
    }
}

//For multiple application we need to add Working directory here in future
export class RepositoryAnalysisRequest {
    Repository: RepositoryDetails;
}

export class RepositoryDetails {
    id: string;
    type: string;
    defaultbranch: string;
    authorizationInfo: {
        scheme: string;
        parameters: {
            accesstoken: string;
        }
    };
}

export interface AzureAccountExtensionExports {
    sessions: AzureSession[];
    subscriptions: { session: AzureSession, subscription: SubscriptionModels.Subscription }[];
    filters: { session: AzureSession, subscription: SubscriptionModels.Subscription }[];
    waitForLogin: () => Promise<boolean>;
}

export interface DevOpsProject {
    id: string;
    name: string;
}

export interface GitRepositoryParameters {
    repositoryProvider: RepositoryProvider;
    repositoryName: string;
    repositoryId: string;
    remoteName: string;
    remoteUrl: string;
    branch: string;
    commitId: string;
    localPath: string;
    serviceConnectionId?: string; // Id of the service connection in Azure DevOps
}

export enum AzureConnectionType {
    None,
    AzureRMServicePrincipal,
    AzureRMPublishProfile
}

export interface Token {
    session: AzureSession;
    accessToken: string;
    refreshToken: string;
}

export interface AadApplication {
    appId: string;
    secret: string;
    objectId: string;
}

export interface GitBranchDetails {
    remoteName: string;
    branch: string;
}

export interface WebAppSourceControl {
    id: string;
    name: string;
    properties: {
        repoUrl: string;
        isGitHubAction: boolean;
        branch: string;
    };
}

export enum SourceOptions {
    CurrentWorkspace = 'Current workspace',
    BrowseLocalMachine = 'Browse local machine',
    GithubRepository = 'Github repository'
}

export enum RepositoryProvider {
    Github = 'github',
    AzureRepos = 'tfsgit'
}

export enum TargetResourceType {
    None = 'none',
    WebApp = 'Microsoft.Web/sites',
    AKS = 'Microsoft.ContainerService/ManagedClusters',
    ACR = 'Microsoft.ContainerRegistry/registries'
}

export enum ServiceConnectionType {
    GitHub = 'github',
    AzureRM = 'arm',
    ACR = "containerRegistery",
    AKS = 'azureKubernetes'
}

export enum TargetKind {
    WindowsApp = 'app',
    FunctionApp = 'functionapp',
    FunctionAppLinux = 'functionapp,linux',
    FunctionAppLinuxContainer = 'functionapp,linux,container',
    LinuxApp = 'app,linux',
    LinuxContainerApp = 'app,linux,container'
}

export enum SupportedLanguage {
    NONE = 'none',
    NODE = 'node',
    PYTHON = 'python',
    DOTNETCORE = 'dotnetcore',
    DOCKER = 'docker'
}
