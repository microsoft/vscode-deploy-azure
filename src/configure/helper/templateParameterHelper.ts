import { GenericResource } from "azure-arm-resource/lib/resource/models";
import * as utils from 'util';
import { AppServiceClient } from "../clients/azure/appServiceClient";
import { ApiVersions, AzureResourceClient } from "../clients/azure/azureResourceClient";
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
    public static getParameterForTargetResourceType(parameters: TemplateParameter[], targetResourceType: TargetResourceType, targetResourceKind?: TargetKind): TemplateParameter {
        let dataSourceIdForResourceType = TemplateParameterHelper.convertAzureResourceToDataSourceId(targetResourceType, targetResourceKind);
        return parameters.find((parameter) => { return (parameter.type === TemplateParameterType.GenericAzureResource && parameter.dataSourceId.startsWith(dataSourceIdForResourceType)); });
    }

    public static getParameterValueForTargetResourceType(pipelineConfiguration: PipelineConfiguration, targetResourceType: TargetResourceType, targetResourceKind?: TargetKind): GenericResource {
        let dataSourceIdForResourceType = TemplateParameterHelper.convertAzureResourceToDataSourceId(targetResourceType, targetResourceKind);
        let resourceTemplateParameter = pipelineConfiguration.template.parameters.find((parameter) => { return (parameter.type === TemplateParameterType.GenericAzureResource && parameter.dataSourceId.startsWith(dataSourceIdForResourceType)); });
        if (!resourceTemplateParameter) {
            throw utils.format(Messages.azureResourceTemplateParameterCouldNotBeFound, targetResourceType);
        }

        let parameterValue: GenericResource = pipelineConfiguration.params[resourceTemplateParameter.name];
        if (!parameterValue) {
            throw utils.format(Messages.parameterWithNameNotSet, resourceTemplateParameter.name);
        }

        return parameterValue;
    }

    public static getMatchingAzureResourceTemplateParameter(resource: GenericResource, templateParameters: TemplateParameter[]): TemplateParameter {
        if (!resource || !templateParameters) {
            return null;
        }

        let resourceTargetType = TemplateParameterHelper.convertAzureResourceToDataSourceId(<TargetResourceType>resource.type, <TargetKind>resource.kind);
        let matchedParam = templateParameters.find((templateParameter) => { return templateParameter.dataSourceId.toLowerCase() === resourceTargetType.toLowerCase(); });

        if (matchedParam) {
            return matchedParam;
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
            }
        }
    }

    private static convertAzureResourceToDataSourceId(targetType: TargetResourceType, targetKind: TargetKind): string {
        return targetKind ? targetType + ":" + targetKind : targetType;
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

        let azureResourceClient = new AzureResourceClient(inputs.azureSession.credentials, inputs.subscriptionId);
        if (!!parameter) {
            switch (parameter.dataSourceId) {
                case PreDefinedDataSourceIds.ACR:
                case PreDefinedDataSourceIds.AKS:
                    let azureResourceListPromise = azureResourceClient.getResourceList(parameter.dataSourceId, true)
                        .then((list) => list.map(x => { return { label: x.name, data: x }; }));
                    while (1) {
                        let selectedResource = await controlProvider.showQuickPick(
                            parameter.name,
                            azureResourceListPromise,
                            { placeHolder: parameter.displayName },
                            utils.format(TelemetryKeys.pickListCount, parameter.dataSourceId));

                        let detailedResource = await this.tryGetSelectedResourceById(
                            selectedResource.data.id,
                            azureResourceClient,
                            ApiVersions.get(parameter.dataSourceId === PreDefinedDataSourceIds.ACR ? TargetResourceType.ACR : TargetResourceType.AKS));
                        if (!detailedResource) {
                            throw utils.format(Messages.unableToGetSelectedResource, selectedResource.label);
                        }

                        if (parameter.dataSourceId === PreDefinedDataSourceIds.ACR) {
                            if (detailedResource.properties.adminUserEnabled === false) {
                                controlProvider.showErrorMessage(constants.AcrDoesNotHaveAdminAccessEnabled, Messages.onlyAdminEnabledRegistriesAreAllowed);
                                continue;
                            }
                        }

                        inputs.pipelineConfiguration.params[parameter.name] = detailedResource;
                        break;
                    }
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
        }
    }

    private async tryGetSelectedResourceById(selectedResourceId: string, azureResourceClient: AzureResourceClient, getResourceApiVersion?: string): Promise<GenericResource> {
        try {
            let detailedResource = null;
            if (getResourceApiVersion) {
                detailedResource = await azureResourceClient.getResource(selectedResourceId, getResourceApiVersion);
            }
            else {
                detailedResource = await azureResourceClient.getResource(selectedResourceId);
            }

            if (detailedResource) {
                return detailedResource;
            }
        }
        catch (err) {
            console.log(err);
            // continue;
        }

        return null;
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
            switch (parameter.dataSourceId) {
                case PreDefinedDataSourceIds.RepoAnalysis:
                    if (parameter.name.toLowerCase() === 'containerport') {
                        var port = templateHelper.getDockerPort(inputs.sourceRepository.localPath);
                        port = port ? port : parameter.defaultValue;

                        inputs.pipelineConfiguration.params[parameter.name] = port;
                    }
                    break;
                default:
                    if (parameter.options) {
                        inputs.pipelineConfiguration.params[parameter.name] = await controlProvider.showQuickPick(
                            parameter.name,
                            parameter.options ? parameter.options.map(x => { return { label: x.key, data: x.value }; }) : [],
                            { placeHolder: parameter.displayName },
                            utils.format(TelemetryKeys.pickListCount, parameter.name));
                    }
            }
        }
    }
}