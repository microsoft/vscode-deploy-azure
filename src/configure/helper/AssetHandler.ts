import * as utils from 'util';
import * as vscode from 'vscode';
import { UniqueResourceNameSuffix } from '../configure';
import { AzurePipelineConfigurer } from '../configurers/azurePipelineConfigurer';
import { Configurer } from "../configurers/configurerBase";
import { WizardInputs } from "../model/models";
import { TemplateAsset, TemplateAssetType } from '../model/templateModels';
import { Messages } from '../resources/messages';
import { TracePoints } from '../resources/tracePoints';
import { GraphHelper } from './graphHelper';
import { telemetryHelper } from './telemetryHelper';

const Layer = "AssetCreationHandler";

export class AssetCreationHandler {
    public async createAssets(assets: TemplateAsset[], inputs: WizardInputs, configurer) {
        if (!!assets && assets.length > 0) {
            assets.forEach(async (asset) => {
                await this.getConnectedServiceParameter(asset, inputs, configurer);
            });
        }
    }

    private async getConnectedServiceParameter(asset: TemplateAsset, inputs: WizardInputs, configurer: Configurer): Promise<void> {
        if (!!asset) {
            switch (asset.type) {
                case TemplateAssetType.AzureARM:
                    inputs.pipelineParameters.assets[asset.id] = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: utils.format(Messages.creatingAzureServiceConnection, inputs.subscriptionId)
                        },
                        async () => {
                            try {
                                let scope = inputs.pipelineParameters.params["targetResource"].id;
                                let aadAppName = GraphHelper.generateAadApplicationName(inputs.organizationName, inputs.project.name);
                                let aadApp = await GraphHelper.createSpnAndAssignRole(inputs.azureSession, aadAppName, scope);
                                let serviceConnectionName = `${inputs.pipelineParameters.params["targetResource"].name}-${UniqueResourceNameSuffix}`;
                                await (configurer as AzurePipelineConfigurer).createServiceConnection(inputs, serviceConnectionName, aadApp, scope);
                            }
                            catch (error) {
                                telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                                throw error;
                            }
                        });
                    break;
                // uses azure resource client to get the required details, and then calls into configurer.createServiceConnection(serviceConnectionType, properties: property bag with all the required information that are needed/available to create service connection.)
                case TemplateAssetType.ACRServiceConnection:
                case TemplateAssetType.AKSServiceConnectionKubeConfig:
                case TemplateAssetType.AzureARMPublishProfile:
                case TemplateAssetType.GitHubARM:
                case TemplateAssetType.GitHubARMPublishProfile:
                default:
                    throw new Error(utils.format(Messages.parameterOfTypeNotSupported, asset.type));
            }
        }
    }
}