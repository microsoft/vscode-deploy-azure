import { AzureEnvironment } from 'ms-rest-azure';
import { OutputChannel, ExtensionContext, QuickPickItem } from 'vscode';
import { ServiceClientCredentials } from 'ms-rest';
import { SubscriptionModels } from 'azure-arm-resource';
import { UIExtensionVariables, IAzureUserInput, ITelemetryReporter } from 'vscode-azureextensionui';
import { Messages } from '../resources/messages';
import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { PipelineTemplate } from './templateModels';

class ExtensionVariables implements UIExtensionVariables {
    public azureAccountExtensionApi: AzureAccountExtensionExports;
    public context: ExtensionContext;
    public outputChannel: OutputChannel;
    public reporter: ITelemetryReporter;
    public ui: IAzureUserInput;
    public enableGitHubWorkflow: boolean;

    constructor() {
        this.enableGitHubWorkflow = false;
    }
}

let extensionVariables = new ExtensionVariables();
export { extensionVariables };

export interface AzureAccountExtensionExports {
    sessions: AzureSession[];
    subscriptions: { session: AzureSession, subscription: SubscriptionModels.Subscription }[];
    filters: { session: AzureSession, subscription: SubscriptionModels.Subscription }[];
    waitForLogin: () => Promise<boolean>;
}

export class WizardInputs {
    organizationName: string;
    project: DevOpsProject;
    isNewOrganization: boolean;
    sourceRepository: GitRepositoryParameters;
    targetResource: AzureParameters = new AzureParameters();
    pipelineParameters: PipelineParameters = new PipelineParameters();
    azureSession: AzureSession;
    subscriptionId: string;
    githubPATToken?: string;
}

export class AzureParameters {
    subscriptionId: string;
    resource: GenericResource;
    serviceConnectionId: string;
}

export interface DevOpsProject {
    id: string;
    name: string;
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

export class PipelineParameters {
    filePath: string;
    template: PipelineTemplate;
    workingDirectory: string;
    params: { [key: string]: any } = {};
    assets: { [key: string]: any } = {};
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

export enum TargetResourceType {
    None = 'none',
    WebApp = 'Microsoft.Web/sites',
    AKS = 'Microsoft.ContainerService/ManagedClusters',
    ACR = 'Microsoft.ContainerRegistry/registries'
}

export enum TargetKind {
    WindowsApp = 'app',
    FunctionApp = 'functionapp',
    FunctionAppLinux = 'functionapp,linux',
    FunctionAppLinuxContainer = 'functionapp,linux,container',
    LinuxApp = 'app,linux',
    LinuxContainerApp = 'app,linux,container'
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