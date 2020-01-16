import * as utils from 'util';
import * as vscode from 'vscode';
import { UniqueResourceNameSuffix } from '../configure';
import { Configurer } from "../configurers/configurerBase";
import { ServiceConnectionType, WizardInputs } from "../model/models";
import { TemplateAsset, TemplateAssetType, TemplateParameterType } from '../model/templateModels';
import { Messages } from '../resources/messages';
import { TracePoints } from '../resources/tracePoints';
import { GraphHelper } from './graphHelper';
import { telemetryHelper } from './telemetryHelper';

const Layer = "AssetCreationHandler";

export class AssetCreationHandler {
    public async createAssets(assets: TemplateAsset[], inputs: WizardInputs, configurer: Configurer) {
        if (!!assets && assets.length > 0) {
            assets.forEach(async (asset) => {
                await this.createAssetInternal(asset, inputs, configurer);
            });
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
                                return await configurer.createSecretOrServiceConnection(serviceConnectionName, ServiceConnectionType.AzureRM, { "aadApp": aadApp, "scope": scope}, inputs);
                            }
                            catch (error) {
                                telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                                throw error;
                            }
                        });
                    break;
                // uses azure resource client to get the required details, and then calls into configurer.createServiceConnection(serviceConnectionType, properties: property bag with all the required information that are needed/available to create service connection.)
                case TemplateAssetType.ACRServiceConnection:
                case TemplateAssetType.AKSKubeConfigServiceConnection:
                case TemplateAssetType.AzureARMPublishProfileServiceConnection:
                case TemplateAssetType.GitHubARM:
                case TemplateAssetType.GitHubARMPublishProfile:
                default:
                    throw new Error(utils.format(Messages.assetOfTypeNotSupported, asset.type));
            }
        }
    }
}