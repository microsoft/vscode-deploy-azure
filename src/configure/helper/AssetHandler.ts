import * as utils from 'util';
import * as vscode from 'vscode';
import { AppServiceClient } from '../clients/azure/appServiceClient';
import { ArmRestClient } from '../clients/azure/armRestClient';
import { UniqueResourceNameSuffix } from '../configure';
import { TargetResourceType, WizardInputs } from "../model/models";
import { LocalPipelineTemplate, TemplateAsset, TemplateAssetType, TemplateParameterType } from '../model/templateModels';
import { Messages } from '../resources/messages';
import { TracePoints } from '../resources/tracePoints';
import { GraphHelper } from './graphHelper';
import { SodiumLibHelper } from './sodium/SodiumLibHelper';
import { telemetryHelper } from './telemetryHelper';
import { TemplateParameterHelper } from './templateParameterHelper';

const Layer = "AssetCreationHandler";

export class AssetHandler {
    // tslint:disable-next-line:no-reserved-keywords
    public async createAssets(assets: TemplateAsset[], inputs: WizardInputs, createAsset: (name: string, type: TemplateAssetType, data: any, inputs: WizardInputs) => Promise<string>): Promise<void> {
        if (inputs.pipelineConfiguration.template.label === "Containerized application to Azure Kubernetes Service (AKS)") {
            if (!!assets && assets.length > 0) {
                for (let asset of assets) {
                    await this.createAssetInternal(asset, inputs, createAsset);
                }
            }
        }
    }

    // tslint:disable-next-line:no-reserved-keywords
    private async createAssetInternal(asset: TemplateAsset, inputs: WizardInputs, createAsset: (name: string, type: TemplateAssetType, data: any, inputs: WizardInputs) => Promise<string>): Promise<void> {
        if (!!asset) {
            switch (asset.type) {
                case TemplateAssetType.AzureARMServiceConnection:
                    inputs.pipelineConfiguration.assets[asset.id] = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: utils.format(Messages.creatingAzureServiceConnection, inputs.subscriptionId)
                        },
                        async () => {
                            try {
                                // find LCS of all azure resource params
                                let scope = inputs.pipelineConfiguration.params["targetResource"].id;
                                let aadAppName = GraphHelper.generateAadApplicationName(inputs.organizationName, inputs.project.name);
                                let aadApp = await GraphHelper.createSpnAndAssignRole(inputs.azureSession, aadAppName, scope);
                                // Use param name for first azure resource param
                                let serviceConnectionName = `${inputs.pipelineConfiguration.params[(inputs.pipelineConfiguration.template as LocalPipelineTemplate).parameters.find((parameter) => parameter.type === TemplateParameterType.GenericAzureResource).name]}-${UniqueResourceNameSuffix}`;
                                return await createAsset(serviceConnectionName, asset.type, { "aadApp": aadApp, "scope": scope }, inputs);
                            }
                            catch (error) {
                                telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                                throw error;
                            }
                        });
                    break;
                case TemplateAssetType.AzureARMPublishProfileServiceConnection:
                    let targetWebAppResource = TemplateParameterHelper.getParameterValueForTargetResourceType(inputs.pipelineConfiguration, TargetResourceType.WebApp);
                    inputs.pipelineConfiguration.assets[asset.id] = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: utils.format(Messages.creatingAzureServiceConnection, inputs.subscriptionId)
                        },
                        async () => {
                            try {
                                // find LCS of all azure resource params
                                let appServiceClient = new AppServiceClient(inputs.azureSession.credentials, inputs.azureSession.environment, inputs.azureSession.tenantId, inputs.subscriptionId);
                                let publishProfile = await appServiceClient.getWebAppPublishProfileXml(inputs.targetResource.resource.id);
                                let serviceConnectionName = `${targetWebAppResource.name}-${UniqueResourceNameSuffix}`;
                                return await createAsset(serviceConnectionName, asset.type, publishProfile, inputs);
                            }
                            catch (error) {
                                telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                                throw error;
                            }
                        });
                    break;
                // uses azure resource client to get the required details, and then calls into configurer.createServiceConnection(serviceConnectionType, properties: property bag with all the required information that are needed/available to create service connection.)
                case TemplateAssetType.AKSKubeConfigServiceConnection:
                case TemplateAssetType.GitHubAKSKubeConfig:
                    let targetAksResource = TemplateParameterHelper.getParameterValueForTargetResourceType(inputs.pipelineConfiguration, TargetResourceType.AKS);
                    inputs.pipelineConfiguration.assets[asset.id] = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: utils.format(Messages.creatingKubernetesConnection, targetAksResource.name)
                        },
                        async () => {
                            try {
                                let armClient = new ArmRestClient(inputs.azureSession);
                                let base64EncodedKubeConfig: { kubeconfigs: Array<{ name: string, value: string }> } = await armClient.getAksKubeConfig(targetAksResource.id);
                                let assetName = AssetHandler.getSanitizedUniqueAssetName(targetAksResource.name);
                                return await createAsset(assetName, asset.type, SodiumLibHelper.decodeFromBase64(JSON.stringify(base64EncodedKubeConfig.kubeconfigs[0].value)), inputs);
                            }
                            catch (error) {
                                telemetryHelper.logError(Layer, TracePoints.AssetCreationFailure, error);
                                throw error;
                            }
                        });
                    break;
                case TemplateAssetType.ACRServiceConnection:
                    let targetAcrResource = TemplateParameterHelper.getParameterValueForTargetResourceType(inputs.pipelineConfiguration, TargetResourceType.ACR);
                    inputs.pipelineConfiguration.assets[asset.id] = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: utils.format(Messages.creatingContainerRegistryConnection, targetAcrResource.name)
                        },
                        async () => {
                            try {
                                let armClient = new ArmRestClient(inputs.azureSession);
                                let registryCreds: { username: string, passwords: Array<{ name: string, value: string }> } = await armClient.getAcrCredentials(targetAcrResource.id);
                                let assetName = AssetHandler.getSanitizedUniqueAssetName(targetAcrResource.name);
                                return await createAsset(assetName, asset.type, registryCreds, inputs);
                            }
                            catch (error) {
                                telemetryHelper.logError(Layer, TracePoints.AssetCreationFailure, error);
                                throw error;
                            }
                        });
                    break;
                case TemplateAssetType.GitHubRegistryUsername:
                case TemplateAssetType.GitHubRegistryPassword:
                    let acrResource = TemplateParameterHelper.getParameterValueForTargetResourceType(inputs.pipelineConfiguration, TargetResourceType.ACR);
                    inputs.pipelineConfiguration.assets[asset.id] = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: utils.format(Messages.creatingContainerRegistryConnection, acrResource.name)
                        },
                        async () => {
                            try {
                                let armClient = new ArmRestClient(inputs.azureSession);
                                let registryCreds: { username: string, passwords: Array<{ name: string, value: string }> } = await armClient.getAcrCredentials(acrResource.id);
                                let assetName = AssetHandler.getSanitizedUniqueAssetName(acrResource.name);
                                if (asset.type === TemplateAssetType.GitHubRegistryUsername) {
                                    return await createAsset(assetName + "_username", asset.type, registryCreds.username, inputs);
                                }
                                else {
                                    let password = !!registryCreds.passwords && registryCreds.passwords.length > 0 ? registryCreds.passwords[0].value : null;
                                    if (!password) {
                                        throw Messages.unableToFetchPasswordOfContainerRegistry;
                                    }

                                    return await createAsset(assetName + "_password", asset.type, password, inputs);
                                }
                            }
                            catch (error) {
                                telemetryHelper.logError(Layer, TracePoints.AssetCreationFailure, error);
                                throw error;
                            }
                        });
                    break;

                case TemplateAssetType.File:
                    break;
                case TemplateAssetType.GitHubARM:
                case TemplateAssetType.GitHubARMPublishProfile:
                default:
                    throw new Error(utils.format(Messages.assetOfTypeNotSupported, asset.type));
            }
        }
    }

    /**
     * @param assetName : the asset name you need sanitized
     * @returns sanitized asset name and makes it unique by appending 5 digit random alpha numeric string to asset name.
     */
    public static getSanitizedUniqueAssetName(assetName: string): string {
        assetName = assetName + "_" + UniqueResourceNameSuffix;
        assetName = assetName.replace(/\W/g, '');
        return assetName;
    }
}