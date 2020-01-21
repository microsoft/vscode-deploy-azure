import { AzureResourceClient } from "../clients/azure/azureResourceClient";
import { PreDefinedDataSourceIds } from "../model/templateModels";

export class DataSourceHandler {
    public getResultFromPreDefinedDataSourceId(dataSourceId: string, azureResourceClient: AzureResourceClient) {
        switch (dataSourceId) {
            case PreDefinedDataSourceIds.ACR:
            case PreDefinedDataSourceIds.AKS:
            case PreDefinedDataSourceIds.FunctionApp:
            case PreDefinedDataSourceIds.LinuxApp:
            case PreDefinedDataSourceIds.LinuxContainerApp:
            case PreDefinedDataSourceIds.LinuxFunctionApp:
            case PreDefinedDataSourceIds.WindowsApp:
            default:
        }
    }
}