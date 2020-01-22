import * as utils from 'util';
import * as vscode from 'vscode';
import { RestClient } from '../clients/restClient';
import { UniqueResourceNameSuffix } from '../configure';
import { Configurer } from "../configurers/configurerBase";
import { ParsedAzureResourceId, TargetResourceType, WizardInputs } from "../model/models";
import { TemplateAsset, TemplateAssetType, TemplateParameterType } from '../model/templateModels';
import { Messages } from '../resources/messages';
import { TracePoints } from '../resources/tracePoints';
import { GraphHelper } from './graphHelper';
import { SodiumLibHelper } from './sodium/SodiumLibHelper';
import { telemetryHelper } from './telemetryHelper';
import { TemplateParameterHelper } from './templateParameterHelper';

const Layer = "AssetCreationHandler";

export class AssetHandler {
    public async createAssets(assets: TemplateAsset[], inputs: WizardInputs, configurer: Configurer): Promise<void> {
        if (!!assets && assets.length > 0) {
            for (let asset of assets) {
                await this.createAssetInternal(asset, inputs, configurer);
            }
        }
    }

    private async createAssetInternal(asset: TemplateAsset, inputs: WizardInputs, configurer: Configurer): Promise<void> {
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
                                let serviceConnectionName = `${inputs.pipelineConfiguration.params[inputs.pipelineConfiguration.template.parameters.find((parameter) => parameter.type === TemplateParameterType.GenericAzureResource).name]}-${UniqueResourceNameSuffix}`;
                                return await configurer.processAsset(serviceConnectionName, asset.type, { "aadApp": aadApp, "scope": scope }, inputs);
                            }
                            catch (error) {
                                telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                                throw error;
                            }
                        });
                    break;
                // uses azure resource client to get the required details, and then calls into configurer.createServiceConnection(serviceConnectionType, properties: property bag with all the required information that are needed/available to create service connection.)
                case TemplateAssetType.AKSKubeConfigServiceConnection:
                    let targetAksResource = TemplateParameterHelper.getParameterValueForTargetResourceType(inputs.pipelineConfiguration, TargetResourceType.AKS);
                    inputs.pipelineConfiguration.assets[asset.id] = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: utils.format(Messages.creatingKubernetesConnection, targetAksResource.name)
                        },
                        async () => {
                            try {
                                let restClient = new RestClient(inputs.azureSession.credentials);
                                let parsedResourceId = new ParsedAzureResourceId(targetAksResource.id);
                                let base64EncodedKubeConfig: { kubeconfigs: Array<{ name: string, value: string }> } = await restClient.sendRequest(
                                    {
                                        url: inputs.azureSession.environment.resourceManagerEndpointUrl + `/subscriptions/${parsedResourceId.subscriptionId}/resourceGroups/${parsedResourceId.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${parsedResourceId.resourceName}/listClusterAdminCredential?api-version=2020-01-01`,
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json"
                                        },
                                        deserializationMapper: null,
                                        serializationMapper: null
                                    });

                                let assetName = AssetHandler.sanitizeAssetName(targetAksResource.name + UniqueResourceNameSuffix);
                                return await configurer.processAsset(assetName, asset.type, SodiumLibHelper.decodeFromBase64(JSON.stringify(base64EncodedKubeConfig.kubeconfigs[0].value)), inputs, { targetResource: targetAksResource });
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
                            title: utils.format(Messages.creatingKubernetesConnection, targetAcrResource.name)
                        },
                        async () => {
                            try {
                                let restClient = new RestClient(inputs.azureSession.credentials);
                                let parsedResourceId = new ParsedAzureResourceId(targetAcrResource.id);
                                let registryCreds: { username: string, passwords: Array<{ name: string, value: string }> } = await restClient.sendRequest(
                                    {
                                        url: inputs.azureSession.environment.resourceManagerEndpointUrl + `/subscriptions/${parsedResourceId.subscriptionId}/resourceGroups/${parsedResourceId.resourceGroup}/providers/Microsoft.ContainerRegistry/registries/${parsedResourceId.resourceName}/listCredentials?api-version=2019-05-01`,
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json"
                                        },
                                        deserializationMapper: null,
                                        serializationMapper: null
                                    });

                                let assetName = AssetHandler.sanitizeAssetName(targetAcrResource.name + UniqueResourceNameSuffix);
                                await configurer.processAsset(assetName, asset.type, registryCreds, inputs, { targetResource: targetAcrResource });
                            }
                            catch (error) {
                                telemetryHelper.logError(Layer, TracePoints.AssetCreationFailure, error);
                                throw error;
                            }
                        });
                    break;
                case TemplateAssetType.AzureARMPublishProfileServiceConnection:
                case TemplateAssetType.GitHubRegistryUsername:
                case TemplateAssetType.GitHubRegistryPassword:
                    targetAcrResource = TemplateParameterHelper.getParameterValueForTargetResourceType(inputs.pipelineConfiguration, TargetResourceType.ACR);
                    inputs.pipelineConfiguration.assets[asset.id] = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: utils.format(Messages.creatingKubernetesConnection, targetAcrResource.name)
                        },
                        async () => {
                            try {
                                let restClient = new RestClient(inputs.azureSession.credentials);
                                let parsedResourceId = new ParsedAzureResourceId(targetAcrResource.id);
                                let registryCreds: { username: string, passwords: Array<{ name: string, value: string }> } = await restClient.sendRequest(
                                    {
                                        url: inputs.azureSession.environment.resourceManagerEndpointUrl + `/subscriptions/${parsedResourceId.subscriptionId}/resourceGroups/${parsedResourceId.resourceGroup}/providers/Microsoft.ContainerRegistry/registries/${parsedResourceId.resourceName}/listCredentials?api-version=2019-05-01`,
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json"
                                        },
                                        deserializationMapper: null,
                                        serializationMapper: null
                                    });

                                let assetName = AssetHandler.sanitizeAssetName(targetAcrResource.name + "_" + UniqueResourceNameSuffix);
                                if (asset.type === TemplateAssetType.GitHubRegistryUsername) {
                                    await configurer.processAsset(assetName + "_username", asset.type, registryCreds.username, inputs, { targetResource: targetAcrResource });
                                }
                                else {
                                    let password = !!registryCreds.passwords && registryCreds.passwords.length > 0 ? registryCreds.passwords[0].value : null;
                                    if (!password) {
                                        throw Messages.unableToFetchPasswordOfContainerRegistry;
                                    }

                                    await configurer.processAsset(assetName + "_password", asset.type, password, inputs, { targetResource: targetAcrResource });
                                }
                            }
                            catch (error) {
                                telemetryHelper.logError(Layer, TracePoints.AssetCreationFailure, error);
                                throw error;
                            }
                        });
                    break;
                case TemplateAssetType.GitHubARM:
                case TemplateAssetType.GitHubARMPublishProfile:
                default:
                    throw new Error(utils.format(Messages.assetOfTypeNotSupported, asset.type));
            }
        }
    }

    public static sanitizeAssetName(secretName: string): string {
        let sanitizedSecretName = '';
        for (let i = 0; i < secretName.length; i++) {
            if ((secretName[i] > '0' || secretName[i] < '9') || (secretName[i] > 'A' || secretName[i] < 'Z') && (secretName[i] > 'a' || secretName[i] < 'z')) {
                sanitizedSecretName = sanitizedSecretName + secretName[i];
            }
        }

        return sanitizedSecretName;
    }
}