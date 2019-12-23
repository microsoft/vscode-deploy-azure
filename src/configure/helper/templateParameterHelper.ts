import { GenericResource } from "azure-arm-resource/lib/resource/models";
import * as utils from 'util';
import { AppServiceClient } from "../clients/azure/appServiceClient";
import { AzureResourceClient } from "../clients/azure/azureResourceClient";
import { openBrowseExperience } from '../configure';
import { Configurer } from '../configurers/configurerBase';
import * as templateHelper from '../helper/templateHelper';
import { QuickPickItemWithData, TargetKind, TargetResourceType, WizardInputs } from "../model/models";
import { PreDefinedDataSourceIds, TemplateParameter, TemplateParameterType } from '../model/templateModels';
import * as constants from '../resources/constants';
import { Messages } from "../resources/messages";
import { TelemetryKeys } from "../resources/telemetryKeys";
import { ControlProvider } from "./controlProvider";

const Layer = "TemplateParameterHelper";

export class TemplateParameterHelper {
    private azureResourceClient: AzureResourceClient;

    public static getMatchingAzureResourceTemplateParameter(resource: GenericResource, templateParameters: TemplateParameter[]): { key: string, value: any } {
        if (!resource || !templateParameters) {
            return null;
        }

        let resourceTargetType = TemplateParameterHelper.convertToAzureResourceType(<TargetResourceType>resource.type, <TargetKind>resource.kind);
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

    private static convertToAzureResourceType(targetType: TargetResourceType, targetKind: TargetKind): string {
        return targetKind ? "resource:" + targetType + ":" + targetKind : "resource:" + targetType;
    }

    private async getParameterValue(parameter: TemplateParameter, inputs: WizardInputs, configurer: Configurer): Promise<void> {
        if (!!parameter) {
            switch (parameter.type) {
                case TemplateParameterType.String:
                    this.getInputParameter(parameter, inputs);
                    break;
                case TemplateParameterType.GenericAzureResource:
                    this.getAzureResourceParameter(parameter, inputs);
                    break;
                case TemplateParameterType.Boolean:
                case TemplateParameterType.SecureString:
                default:
                    throw new Error(utils.format(Messages.parameterOfTypeNotSupported, parameter.type));
            }
        }
    }

    private async getAzureResourceParameter(parameter: TemplateParameter, inputs: WizardInputs): Promise<void> {
        let controlProvider = new ControlProvider();

        if (!!parameter) {
            switch (parameter.dataSourceId) {
                case PreDefinedDataSourceIds.ACR.toString():
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
                case PreDefinedDataSourceIds.AKS.toString():
                    if (!this.azureResourceClient) {
                        this.azureResourceClient = new AzureResourceClient(inputs.azureSession.credentials, inputs.subscriptionId);
                    }

                    let selectedAks = await controlProvider.showQuickPick(
                        parameter.name,
                        this.azureResourceClient.getResourceList(parameter.type.toString(), true)
                            .then((acrList) => acrList.map(x => { return { label: x.name, data: x }; })),
                        { placeHolder: parameter.displayName },
                        TelemetryKeys.AksListCount);
                    inputs.pipelineParameters.params[parameter.name] = selectedAks.data;
                    break;
                case PreDefinedDataSourceIds.WindowsApp.toString():
                case PreDefinedDataSourceIds.LinuxApp.toString():
                case PreDefinedDataSourceIds.FunctionApp.toString():
                case PreDefinedDataSourceIds.LinuxFunctionApp.toString():
                    let selectedPipelineTemplate = inputs.pipelineParameters.template;
                    let matchingPipelineTemplates = templateHelper.getPipelineTemplatesForAllWebAppKind(inputs.sourceRepository.repositoryProvider,
                        selectedPipelineTemplate.label, selectedPipelineTemplate.language, selectedPipelineTemplate.targetKind);

                    let appServiceClient = new AppServiceClient(inputs.azureSession.credentials, inputs.azureSession.environment, inputs.azureSession.tenantId, inputs.subscriptionId);

                    let webAppKinds = matchingPipelineTemplates.map((template) => template.targetKind);
                    let selectedResource: QuickPickItemWithData = await controlProvider.showQuickPick(
                        Messages.selectTargetResource,
                        appServiceClient.GetAppServices(webAppKinds)
                            .then((webApps) => webApps.map(x => { return { label: x.name, data: x }; })),
                        { placeHolder: Messages.selectTargetResource },
                        TelemetryKeys.AzureResourceListCount);

                    if (await appServiceClient.isScmTypeSet((<GenericResource>selectedResource.data).id)) {
                        await openBrowseExperience((<GenericResource>selectedResource.data).id);
                        throw Error(Messages.setupAlreadyConfigured);
                    }
                    else {
                        inputs.pipelineParameters.params[constants.TargetResource] = selectedResource.data;
                        inputs.pipelineParameters.template = matchingPipelineTemplates.find((template) => template.targetKind === <TargetKind>inputs.targetResource.resource.kind);
                    }
                    break;
                default:
                    throw new Error(utils.format(Messages.parameterOfTypeNotSupported, parameter.type));
            }
        }
    }

    private async getInputParameter(parameter: TemplateParameter, inputs: WizardInputs): Promise<void> {
        let controlProvider = new ControlProvider();


        if (!parameter.dataSourceId) {
            inputs.pipelineParameters.params[parameter.name] = await controlProvider.showInputBox(
                parameter.name,
                {
                    placeHolder: parameter.displayName
                }
            );
        }
        else {
            inputs.pipelineParameters.params[parameter.name] = await controlProvider.showQuickPick(
                parameter.name,
                parameter.options ? parameter.options.map(x => { return { label: x.key, data: x.value }; }) : [],
                { placeHolder: parameter.displayName },
                utils.format(TelemetryKeys.pickListCount, parameter.name));
        }

        throw new Error(utils.format(Messages.parameterOfTypeNotSupported, parameter.type));
    }
}