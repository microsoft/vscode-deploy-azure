import { TargetKind, TargetResourceType } from "./models";

export interface PipelineTemplate {
    path: string;
    label: string;
    language: string;
    targetType: TargetResourceType;
    targetKind: TargetKind;
    enabled: boolean;
    parameters?: TemplateParameter[];
    assets?: TemplateAsset[];
}

export interface TemplateParameter {
    name: string;
    displayName: string;
    type: TemplateParameterType;
    dataSourceId? : string;
    defaultValue?: any;
    options?: { key: string, value: any }[];
}

export interface TemplateAsset {
    id: string;
    type: TemplateAssetType;
}

export enum ServiceConnectionType {
    GitHub = 'github',
    AzureRM = 'arm',
    ACR = "containerRegistery",
    AKS = 'azureKubernetes'
}

export enum GitHubSecretType {
    AzureRM = 'arm',
}

export enum TemplateParameterType {
    GenericAzureResource,
    Boolean,
    SecureString,
    String
}

export enum TemplateAssetType {
    AzureARM = "endpoint:" + ServiceConnectionType.AzureRM,
    AzureARMPublishProfile = "endpoint:" + ServiceConnectionType.AzureRM + ":publishProfile",
    ACRServiceConnection = "endpoint:" + ServiceConnectionType.ACR,
    AKSServiceConnectionKubeConfig = "endpoint:" + ServiceConnectionType.AKS + ":kubeconfig",

    GitHubARM = "GitHubSecret:" + GitHubSecretType.AzureRM,
    GitHubARMPublishProfile = "GitHubSecret:" + GitHubSecretType.AzureRM + ":publishProfile"
}

export enum PreDefinedDataSourceIds {
    ACR = TargetResourceType.ACR,
    AKS = TargetResourceType.AKS,
    FunctionApp = TargetResourceType.WebApp + ":" + TargetKind.FunctionApp,
    LinuxApp = TargetResourceType.WebApp + ":" + TargetKind.LinuxApp,
    LinuxContainerApp = TargetResourceType.WebApp + ":" + TargetKind.LinuxContainerApp,
    LinuxFunctionApp = TargetResourceType.WebApp + ":" + TargetKind.FunctionAppLinux,
    LinuxContainerFunctionApp = TargetResourceType.WebApp + ":" + TargetKind.FunctionAppLinuxContainer,
    WindowsApp = TargetResourceType.WebApp + ":" + TargetKind.WindowsApp
}