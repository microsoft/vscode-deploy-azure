import { RestClient } from "../clients/restClient";
import { ParsedAzureResourceId, WizardInputs } from "../model/models";
import { LocalPipelineTemplate, PreDefinedDataSourceIds } from "../model/templateModels";

export class DataSourceHandler {
    public getResultFromPreDefinedDataSourceId(dataSourceId: string, inputs: WizardInputs): Promise<any> {
        switch (dataSourceId) {
            case PreDefinedDataSourceIds.AKS:
                let restClient = new RestClient(inputs.azureSession.credentials);
                let parsedResourceId = new ParsedAzureResourceId(inputs.pipelineConfiguration.params[(inputs.pipelineConfiguration.template as LocalPipelineTemplate).parameters.find((param) => { return param.dataSourceId === PreDefinedDataSourceIds.AKS; }).name].id);
                let kubeConfig = restClient.sendRequestWithHttpOperationResponse(
                    {
                        url: inputs.azureSession.environment.portalUrl + `/subscriptions/${parsedResourceId.subscriptionId}/resourceGroups/${parsedResourceId.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${parsedResourceId.resourceName}/listClusterAdminCredential?api-version=2020-01-01`,
                        method: "POST",
                        deserializationMapper: null,
                        serializationMapper: null
                    });
                return kubeConfig;
            case PreDefinedDataSourceIds.ACR:
            case PreDefinedDataSourceIds.FunctionApp:
            case PreDefinedDataSourceIds.LinuxApp:
            case PreDefinedDataSourceIds.LinuxContainerApp:
            case PreDefinedDataSourceIds.LinuxFunctionApp:
            case PreDefinedDataSourceIds.WindowsApp:
            default:
                return null;
        }
    }
}