import * as templateHelper from './helper/templateHelper';
import * as constants from '../resources/constants';
import { PipelineParameter, WizardInputs, PipelineParameterType, WebAppKind, QuickPickItemWithData, TargetResourceType } from "../model/models";
import { ControlProvider } from "./controlProvider";
import { AzureResourceClient } from "../clients/azure/azureResourceClient";
import { TelemetryKeys } from "../resources/telemetryKeys";
import { AppServiceClient } from "../clients/azure/appServiceClient";
import { Messages } from "../resources/messages";
import { GenericResource } from "azure-arm-resource/lib/resource/models";
import { Configurer } from '../configurers/configurerBase';
import { AzurePipelineConfigurer } from '../configurers/azurePipelineConfigurer';

export class TemplateParameterHelper {
    private azureResourceClient: AzureResourceClient;

    public async getParameters(parameters: PipelineParameter[], inputs: WizardInputs, pipelineConfigurer: Configurer): Promise<void> {
        if (!!inputs.pipelineParameters.template.parameters && inputs.pipelineParameters.template.parameters.length > 0) {
            for (let index = 0; index < parameters.length; index++) {
                let parameter = inputs.pipelineParameters.template.parameters[index];
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
        }
    }

    private async getParameterValue(parameter: PipelineParameter, inputs: WizardInputs, configurer: Configurer): Promise<void> {
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
                    throw 'parameter of type: ' + parameterCategory + ' not supported.';
            }
        }
    }

    private async getAzureResourceParameter(parameter: PipelineParameter, inputs: WizardInputs): Promise<void> {
        let controlProvider = new ControlProvider();

        if (!!parameter) {
            switch (parameter.type) {
                case PipelineParameterType.ACR:
                    if (!this.azureResourceClient) {
                        this.azureResourceClient = new AzureResourceClient(inputs.azureSession.credentials, inputs.azureParameters.subscriptionId);
                    }

                    let selectedAcr = await controlProvider.showQuickPick(
                        parameter.name,
                        this.azureResourceClient.getResourceList(parameter.type.toString(), true)
                            .then((acrList) => acrList.map(x => { return { label: x.name, data: x }; })),
                        { placeHolder: parameter.displayName },
                        TelemetryKeys.AcrListCount);
                    inputs.pipelineParameters.params[parameter.name] = selectedAcr.data;
                    break;
                case PipelineParameterType.AKS:
                    if (!this.azureResourceClient) {
                        this.azureResourceClient = new AzureResourceClient(inputs.azureSession.credentials, inputs.azureParameters.subscriptionId);
                    }

                    let selectedAks = await controlProvider.showQuickPick(
                        parameter.name,
                        this.azureResourceClient.getResourceList(parameter.type.toString(), true)
                            .then((acrList) => acrList.map(x => { return { label: x.name, data: x }; })),
                        { placeHolder: parameter.displayName },
                        TelemetryKeys.AcrListCount);
                    inputs.pipelineParameters.params[parameter.name] = selectedAks.data;
                    break;
                case PipelineParameterType.WindowsApp:
                case PipelineParameterType.LinuxApp:
                case PipelineParameterType.FunctionApp:
                case PipelineParameterType.LinuxFunctionApp:
                    let parameterAppKind = parameter.type.toString().split("-")[1];
                    let webAppKind = (
                        parameterAppKind === WebAppKind.WindowsApp ||
                        parameterAppKind === WebAppKind.LinuxApp) &&
                        inputs.pipelineParameters.template.label.toLowerCase().endsWith('to app service') ?
                        [WebAppKind.WindowsApp, WebAppKind.LinuxApp] : [parameterAppKind];

                    let appServiceClient = new AppServiceClient(inputs.azureSession.credentials, inputs.azureSession.environment, inputs.azureSession.tenantId, inputs.azureParameters.subscriptionId);
                    let selectedApp: QuickPickItemWithData = await controlProvider.showQuickPick(
                        Messages.selectTargetResource,
                        appServiceClient.GetAppServices(<WebAppKind[]>webAppKind)
                            .then((webApps) => webApps.map(x => { return { label: x.name, data: x }; })),
                        { placeHolder: Messages.selectTargetResource },
                        TelemetryKeys.WebAppListCount);

                    if (await appServiceClient.isScmTypeSet((<GenericResource>selectedApp.data).id)) {
                        await this.openBrowseExperience((<GenericResource>selectedApp.data).id);
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
                    break;
            }
        }
    }

    private async getInputParameter(parameter: PipelineParameter, inputs: WizardInputs): Promise<void> {
        let controlProvider = new ControlProvider();

        if (!!parameter) {
            switch (parameter.type) {
                case PipelineParameterType.TextBox:
                    inputs.pipelineParameters.params[parameter.name] = await controlProvider.showInputBox(
                        parameter.name,
                        {
                            placeHolder: parameter.displayName
                        }
                    );
                    break;
                default:
                    break;
            }
        }
    }

    private async getConnectedServiceParameter(parameter: PipelineParameter, inputs: WizardInputs, configurer: Configurer): Promise<void> {
        if (!!parameter) {
            switch (parameter.type) {
                case PipelineParameterType.AzureARM:
                    inputs.pipelineParameters.params[parameter.name] = await (configurer as AzurePipelineConfigurer).createServiceConnection(inputs);
                    break;
                default:
                    break;
            }
        }
    }
}