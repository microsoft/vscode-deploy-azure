import { AzureConnectionType, ServiceConnectionType, TargetKind, TargetResourceType } from "./models";

export enum TemplateType {
    remote,
    local
}
export interface PipelineTemplate {
    label: string;
    templateWeight: number;
    templateType: TemplateType;
    targetType: TargetResourceType;
    targetKind: TargetKind;
    language: string;
}

export interface PipelineTemplateMetadata {
    templateId: string;
    workingDirectory: string;
    templateWeight: number;
    templateDescription: string;
    attributes: TemplateAttributes;
}

export interface RemotePipelineTemplate extends PipelineTemplate {
    templateId: string;
    workingDirectory: string;
}

export interface LocalPipelineTemplate extends PipelineTemplate {
    path: string;
    enabled: boolean;
    parameters?: TemplateParameter[];
    assets?: TemplateAsset[];
    // this should be removed as we will have endpoints/secrets as assets and not a first class property
    azureConnectionType?: AzureConnectionType;
}

export interface TemplateAttributes {
    language: string;
    buildTarget: string;
    deployTarget: string;
}

export interface TemplateParameter {
    name: string;
    displayName: string;
    type: TemplateParameterType;
    dataSourceId?: string;
    defaultValue?: any;
    options?: { key: string, value: any }[];
}

export interface TemplateAsset {
    id: string;
    type: TemplateAssetType;
}

export enum GitHubSecretType {
    AKSKubeConfigSecret = 'aksKubeConfig',
    AzureRM = 'arm',
    ContainerRegistryUsername = "containerRegistryUsername",
    ContainerRegistryPassword = "containerRegistryPassword"
}

export enum TemplateParameterType {
    GenericAzureResource,
    Boolean,
    SecureString,
    String
}

export enum TemplateAssetType {
    AzureARMServiceConnection = "endpoint:" + ServiceConnectionType.AzureRM,
    AzureARMPublishProfileServiceConnection = "endpoint:" + ServiceConnectionType.AzureRM + ":publishProfile",
    ACRServiceConnection = "endpoint:" + ServiceConnectionType.ACR,
    AKSKubeConfigServiceConnection = "endpoint:" + ServiceConnectionType.AKS + ":kubeconfig",

    GitHubARM = "gitHubSecret:" + GitHubSecretType.AzureRM,
    GitHubARMPublishProfile = "gitHubSecret:" + GitHubSecretType.AzureRM + ":publishProfile",
    GitHubAKSKubeConfig = "gitHubSecret:" + GitHubSecretType.AKSKubeConfigSecret + ":kubeconfig",
    GitHubRegistryUsername = "gitHubSecret:" + GitHubSecretType.ContainerRegistryUsername,
    GitHubRegistryPassword = "gitHubSecret:" + GitHubSecretType.ContainerRegistryPassword,
    File = "file" + ":"
}

export let PreDefinedDataSourceIds = {
    ACR: TargetResourceType.ACR,
    AKS: TargetResourceType.AKS,
    FunctionApp: TargetResourceType.WebApp + ":" + TargetKind.FunctionApp,
    LinuxApp: TargetResourceType.WebApp + ":" + TargetKind.LinuxApp,
    LinuxContainerApp: TargetResourceType.WebApp + ":" + TargetKind.LinuxContainerApp,
    LinuxFunctionApp: TargetResourceType.WebApp + ":" + TargetKind.FunctionAppLinux,
    LinuxContainerFunctionApp: TargetResourceType.WebApp + ":" + TargetKind.FunctionAppLinuxContainer,
    WindowsApp: TargetResourceType.WebApp + ":" + TargetKind.WindowsApp,

    RepoAnalysis: 'RepoAnalysis'
};
