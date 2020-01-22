import { GenericResource } from "azure-arm-resource/lib/resource/models";
import * as utils from 'util';
import { AppServiceClient } from "../clients/azure/appServiceClient";
import { AzureResourceClient } from "../clients/azure/azureResourceClient";
import { openBrowseExperience } from '../configure';
import * as templateHelper from '../helper/templateHelper';
import { extensionVariables, PipelineConfiguration, QuickPickItemWithData, TargetKind, TargetResourceType, WizardInputs } from "../model/models";
import { PreDefinedDataSourceIds, TemplateParameter, TemplateParameterType } from '../model/templateModels';
import * as constants from '../resources/constants';
import { Messages } from "../resources/messages";
import { TelemetryKeys } from "../resources/telemetryKeys";
import { getSubscriptionSession } from "./azureSessionHelper";
import { ControlProvider } from "./controlProvider";

export class TemplateParameterHelper {
    private azureResourceClient: AzureResourceClient;

    public static getParameterForTargetResourceType(parameters: TemplateParameter[], targetResourceType: TargetResourceType, targetResourceKind?: TargetKind): TemplateParameter {
        return parameters.find((parameter) => { return (parameter.type === TemplateParameterType.GenericAzureResource && parameter.dataSourceId.startsWith(targetResourceKind ? targetResourceType + ':' + targetResourceKind : targetResourceType)); });
    }

    public static getParameterValueForTargetResourceType(pipelineConfiguration: PipelineConfiguration, targetResourceType: TargetResourceType, targetResourceKind?: TargetKind): any {
        let resourceTemplateParameter = pipelineConfiguration.template.parameters.find((parameter) => { return (parameter.type === TemplateParameterType.GenericAzureResource && parameter.dataSourceId.startsWith(targetResourceKind ? targetResourceType + ':' + targetResourceKind : targetResourceType)); });
        if (!resourceTemplateParameter) {
            throw utils.format(Messages.azureResourceTemplateParameterCouldNotBeFound, targetResourceType);
        }

        let parameterValue: GenericResource = pipelineConfiguration.params[resourceTemplateParameter.name];
        if (!parameterValue) {
            throw utils.format(Messages.parameterWithNameNotSet, resourceTemplateParameter.name);
        }

        return parameterValue;
    }

    public static getMatchingAzureResourceTemplateParameter(resource: GenericResource, templateParameters: TemplateParameter[]): { key: string, value: any } {
        if (!resource || !templateParameters) {
            return null;
        }

        let resourceTargetType = TemplateParameterHelper.convertToAzureResourceType(<TargetResourceType>resource.type, <TargetKind>resource.kind);
        let matchedParam = templateParameters.find((templateParameter) => { return templateParameter.dataSourceId.toLowerCase() === resourceTargetType.toLowerCase(); });

        if (matchedParam) {
            return { key: matchedParam.name, value: resource };
        }

        return null;
    }

    public async setParameters(parameters: TemplateParameter[], inputs: WizardInputs): Promise<void> {
        if (!!parameters && parameters.length > 0) {
            for (let parameter of parameters) {
                if (!inputs.pipelineConfiguration.params[parameter.name]) {
                    try {
                        await this.getParameterValue(parameter, inputs);
                    }
                    catch (err) {
                        if (!inputs.pipelineConfiguration.params[parameter.name] && !!parameter.defaultValue) {
                            inputs.pipelineConfiguration.params[parameter.name] = parameter.defaultValue;
                        }
                        else {
                            throw err;
                        }
                    }
                }
            };
        }
    }

    private static convertToAzureResourceType(targetType: TargetResourceType, targetKind: TargetKind): string {
        return targetKind ? "resource:" + targetType + ":" + targetKind : "resource:" + targetType;
    }

    private async getParameterValue(parameter: TemplateParameter, inputs: WizardInputs): Promise<void> {
        if (!!parameter) {
            switch (parameter.type) {
                case TemplateParameterType.String:
                    await this.getStringParameter(parameter, inputs);
                    break;
                case TemplateParameterType.GenericAzureResource:
                    await this.getAzureResourceParameter(parameter, inputs);
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

        if (!inputs.subscriptionId) {
            // show available subscriptions and get the chosen one
            let subscriptionList = extensionVariables.azureAccountExtensionApi.filters.map((subscriptionObject) => {
                return <QuickPickItemWithData>{
                    label: `${<string>subscriptionObject.subscription.displayName}`,
                    data: subscriptionObject,
                    description: `${<string>subscriptionObject.subscription.subscriptionId}`
                };
            });
            let selectedSubscription: QuickPickItemWithData = await controlProvider.showQuickPick(
                constants.SelectSubscription,
                subscriptionList,
                { placeHolder: Messages.selectSubscription },
                TelemetryKeys.SubscriptionListCount);
            inputs.subscriptionId = selectedSubscription.data.subscription.subscriptionId;
            inputs.azureSession = getSubscriptionSession(inputs.subscriptionId);
        }

        if (!!parameter) {
            switch (parameter.dataSourceId) {
                case PreDefinedDataSourceIds.ACR:
                case PreDefinedDataSourceIds.AKS:
                    if (!this.azureResourceClient) {
                        this.azureResourceClient = new AzureResourceClient(inputs.azureSession.credentials, inputs.subscriptionId);
                    }

                    let selectedContainerResource = await controlProvider.showQuickPick(
                        parameter.name,
                        this.azureResourceClient.getResourceList(parameter.dataSourceId, true)
                            .then((list) => list.map(x => { return { label: x.name, data: x }; })),
                        { placeHolder: parameter.displayName },
                        utils.format(TelemetryKeys.pickListCount, parameter.dataSourceId));
                    inputs.pipelineConfiguration.params[parameter.name] = selectedContainerResource.data;
                    break;
                case PreDefinedDataSourceIds.WindowsApp:
                case PreDefinedDataSourceIds.LinuxApp:
                case PreDefinedDataSourceIds.FunctionApp:
                case PreDefinedDataSourceIds.LinuxFunctionApp:
                    let selectedPipelineTemplate = inputs.pipelineConfiguration.template;
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
                        inputs.pipelineConfiguration.params[constants.TargetResource] = selectedResource.data;
                        inputs.pipelineConfiguration.template = matchingPipelineTemplates.find((template) => template.targetKind === <TargetKind>inputs.targetResource.resource.kind);
                    }
                    break;
                default:
                    throw new Error(utils.format(Messages.parameterWithDataSourceOfTypeNotSupported, parameter.dataSourceId));
            }

            // update the parameter with more details azure generic resource by directly getting the resource via ID
            // orchestration should not fail if this fails
            try {
                let detailedResource = await this.azureResourceClient.getResource(inputs.pipelineConfiguration.params[parameter.name].id);
                if (detailedResource) {
                    inputs.pipelineConfiguration.params[parameter.name] = detailedResource;
                }
            }
            catch (err) {
                // continue;
            }
        }
    }

    private async getStringParameter(parameter: TemplateParameter, inputs: WizardInputs): Promise<void> {
        let controlProvider = new ControlProvider();

        if (!parameter.dataSourceId) {
            inputs.pipelineConfiguration.params[parameter.name] = await controlProvider.showInputBox(
                parameter.name,
                {
                    placeHolder: parameter.displayName
                }
            );
        }
        else {
            inputs.pipelineConfiguration.params[parameter.name] = await controlProvider.showQuickPick(
                parameter.name,
                parameter.options ? parameter.options.map(x => { return { label: x.key, data: x.value }; }) : [],
                { placeHolder: parameter.displayName },
                utils.format(TelemetryKeys.pickListCount, parameter.name));
        }
    }
}