import * as vscode from 'vscode';
import * as utils from 'util';
import * as templateHelper from '../helper/templateHelper';
import * as constants from '../resources/constants';
import { WizardInputs, TemplateParameter, WebAppKind, QuickPickItemWithData, TargetResourceType, TemplateParameterType, InputModeType } from "../model/models";
import { ControlProvider } from "./controlProvider";
import { AzureResourceClient } from "../clients/azure/azureResourceClient";
import { TelemetryKeys } from "../resources/telemetryKeys";
import { AppServiceClient } from "../clients/azure/appServiceClient";
import { Messages } from "../resources/messages";
import { GenericResource } from "azure-arm-resource/lib/resource/models";
import { Configurer } from '../configurers/configurerBase';
import { AzurePipelineConfigurer } from '../configurers/azurePipelineConfigurer';
import { GraphHelper } from './graphHelper';
import { UniqueResourceNameSuffix, openBrowseExperience } from '../configure';
import { telemetryHelper } from './telemetryHelper';
import { TracePoints } from '../resources/tracePoints';

const Layer = "TemplateParameterHelper";

export class TemplateParameterHelper {
    private azureResourceClient: AzureResourceClient;

    public static getMatchingAzureResourceTemplateParameter(resource: GenericResource, templateParameters: TemplateParameter[]): { key: string, value: any } {
        if (!resource || !templateParameters) {
            return null;
        }

        let resourceTargetType = TemplateParameterHelper.convertToAzureResourceType(<TargetResourceType>resource.type, <WebAppKind>resource.kind);
        let matchedParam = templateParameters.find((templateParameter) => { return templateParameter.type.toString().toLowerCase() === resourceTargetType.toLowerCase(); });

        if (matchedParam) {
            return { key: matchedParam.name, value: resource };
        }

        return null;
    }

    public async setParameters(parameters: TemplateParameter[], inputs: WizardInputs, pipelineConfigurer: Configurer): Promise<void> {
        if (!!parameters && parameters.length > 0) {
            parameters.forEach(async (parameter) => {
                if (!inputs.pipelineParameters.params[parameter.name]) {
                    try {
                        await this.getParameterValue(parameter, inputs, pipelineConfigurer);
                    }
                    catch (err) {
                        if (!inputs.pipelineParameters.params[parameter.name] && !!parameter.defaultValue) {
                            inputs.pipelineParameters.params[parameter.name] = parameter.defaultValue;
                        }
                        else {
                            throw err;
                        }
                    }
                }
            });
        }
    }

    private static convertToAzureResourceType(targetType: TargetResourceType, targetKind: WebAppKind): string {
        return targetKind ? "resource:" + targetType + ":" + targetKind : "resource:" + targetType;
    }

    private async getParameterValue(parameter: TemplateParameter, inputs: WizardInputs, configurer: Configurer): Promise<void> {
        if (!!parameter) {
            let parameterCategory = parameter.type.toString().split(":")[0];
            switch (parameterCategory) {
                case 'input':
                    this.getInputParameter(parameter, inputs);
                    break;
                case 'resource':
                    this.getAzureResourceParameter(parameter, inputs);
                    break;
                case 'connectedService':
                    this.getConnectedServiceParameter(parameter, inputs, configurer);
                    break;
                default:
                    throw new Error(utils.format(Messages.parameterOfTypeNotSupported, parameter.type));
            }
        }
    }

    private async getAzureResourceParameter(parameter: TemplateParameter, inputs: WizardInputs): Promise<void> {
        let controlProvider = new ControlProvider();

        if (!!parameter) {
            switch (parameter.type) {
                case TemplateParameterType.ACR:
                    if (!this.azureResourceClient) {
                        this.azureResourceClient = new AzureResourceClient(inputs.azureSession.credentials, inputs.subscriptionId);
                    }

                    let selectedAcr = await controlProvider.showQuickPick(
                        parameter.name,
                        this.azureResourceClient.getResourceList(parameter.type.toString(), true)
                            .then((acrList) => acrList.map(x => { return { label: x.name, data: x }; })),
                        { placeHolder: parameter.displayName },
                        TelemetryKeys.AcrListCount);
                    inputs.pipelineParameters.params[parameter.name] = selectedAcr.data;
                    break;
                case TemplateParameterType.AKS:
                    if (!this.azureResourceClient) {
                        this.azureResourceClient = new AzureResourceClient(inputs.azureSession.credentials, inputs.subscriptionId);
                    }

                    let selectedAks = await controlProvider.showQuickPick(
                        parameter.name,
                        this.azureResourceClient.getResourceList(parameter.type.toString(), true)
                            .then((acrList) => acrList.map(x => { return { label: x.name, data: x }; })),
                        { placeHolder: parameter.displayName },
                        TelemetryKeys.AcrListCount);
                    inputs.pipelineParameters.params[parameter.name] = selectedAks.data;
                    break;
                case TemplateParameterType.WindowsApp:
                case TemplateParameterType.LinuxApp:
                case TemplateParameterType.FunctionApp:
                case TemplateParameterType.LinuxFunctionApp:
                    let parameterAppKind = parameter.type.toString().split("-")[1];
                    let webAppKind = (
                        parameterAppKind === WebAppKind.WindowsApp ||
                        parameterAppKind === WebAppKind.LinuxApp) &&
                        inputs.pipelineParameters.template.label.toLowerCase().endsWith('to app service') ?
                        [WebAppKind.WindowsApp, WebAppKind.LinuxApp] : [parameterAppKind];

                    let appServiceClient = new AppServiceClient(inputs.azureSession.credentials, inputs.azureSession.environment, inputs.azureSession.tenantId, inputs.subscriptionId);
                    let selectedApp: QuickPickItemWithData = await controlProvider.showQuickPick(
                        Messages.selectTargetResource,
                        appServiceClient.GetAppServices(<WebAppKind[]>webAppKind)
                            .then((webApps) => webApps.map(x => { return { label: x.name, data: x }; })),
                        { placeHolder: Messages.selectTargetResource },
                        TelemetryKeys.WebAppListCount);

                    if (await appServiceClient.isScmTypeSet((<GenericResource>selectedApp.data).id)) {
                        await openBrowseExperience((<GenericResource>selectedApp.data).id);
                        throw Error(Messages.setupAlreadyConfigured);
                    }
                    else {
                        inputs.pipelineParameters.params[constants.TargetResource] = selectedApp.data;
                        inputs.pipelineParameters.template = templateHelper.getTemplate(
                            inputs.sourceRepository.repositoryProvider,
                            inputs.pipelineParameters.template.language,
                            TargetResourceType.WebApp,
                            <WebAppKind>inputs.pipelineParameters.params[constants.TargetResource].kind);
                    }
                    break;
                default:
                    throw new Error(utils.format(Messages.parameterOfTypeNotSupported, parameter.type));
            }
        }
    }

    private async getInputParameter(parameter: TemplateParameter, inputs: WizardInputs): Promise<void> {
        let controlProvider = new ControlProvider();

        if (!!parameter) {
            switch (parameter.type) {
                case TemplateParameterType.String:
                    switch (parameter.inputMode) {
                        case InputModeType.PickList:
                            inputs.pipelineParameters.params[parameter.name] = await controlProvider.showQuickPick(
                                parameter.name,
                                parameter.options ? parameter.options.map(x => { return { label: x.key, data: x.value }; }) : [],
                                { placeHolder: parameter.displayName },
                                utils.format(TelemetryKeys.pickListCount, parameter.name));
                            break;
                        case InputModeType.TextBox:
                        case InputModeType.None:
                        default:
                            inputs.pipelineParameters.params[parameter.name] = await controlProvider.showInputBox(
                                parameter.name,
                                {
                                    placeHolder: parameter.displayName
                                }
                            );
                            break;
                    }
                    break;
                default:
                    throw new Error(utils.format(Messages.parameterOfTypeNotSupported, parameter.type));
            }
        }
    }

    private async getConnectedServiceParameter(parameter: TemplateParameter, inputs: WizardInputs, configurer: Configurer): Promise<void> {
        if (!!parameter) {
            switch (parameter.type) {
                case TemplateParameterType.AzureARM:
                    inputs.pipelineParameters.params[parameter.name] = await vscode.window.withProgress(
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
                case TemplateParameterType.ACRServiceConnection:
                case TemplateParameterType.AKSServiceConnectionKubeConfig:
                    throw new Error(utils.format(Messages.parameterOfTypeNotSupported, parameter.type));
                    break;
                default:
                    break;
            }
        }
    }
}