import { AzureConnectionType, ServiceConnectionType, TargetKind, TargetResourceType } from "./models";

export interface PipelineTemplate {
    path: string;
    label: string;
    language: string;
    targetType: TargetResourceType;
    targetKind: TargetKind;
    enabled: boolean;
    parameters?: TemplateParameter[];
    assets?: TemplateAsset[];
    azureConnectionType: AzureConnectionType;
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
    AzureARMServiceConnection = "endpoint:" + ServiceConnectionType.AzureRM,
    AzureARMPublishProfileServiceConnection = "endpoint:" + ServiceConnectionType.AzureRM + ":publishProfile",
    ACRServiceConnection = "endpoint:" + ServiceConnectionType.ACR,
    AKSKubeConfigServiceConnection = "endpoint:" + ServiceConnectionType.AKS + ":kubeconfig",

    GitHubARM = "gitHubSecret:" + GitHubSecretType.AzureRM,
    GitHubARMPublishProfile = "gitHubSecret:" + GitHubSecretType.AzureRM + ":publishProfile"
}

export let PreDefinedDataSourceIds = {
    ACR: TargetResourceType.ACR,
    AKS: TargetResourceType.AKS,
    FunctionApp: TargetResourceType.WebApp + ":" + TargetKind.FunctionApp,
    LinuxApp: TargetResourceType.WebApp + ":" + TargetKind.LinuxApp,
    LinuxContainerApp: TargetResourceType.WebApp + ":" + TargetKind.LinuxContainerApp,
    LinuxFunctionApp: TargetResourceType.WebApp + ":" + TargetKind.FunctionAppLinux,
    LinuxContainerFunctionApp: TargetResourceType.WebApp + ":" + TargetKind.FunctionAppLinuxContainer,
    WindowsApp: TargetResourceType.WebApp + ":" + TargetKind.WindowsApp
};
