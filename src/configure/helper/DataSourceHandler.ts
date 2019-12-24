import { AzureResourceClient } from "../clients/azure/azureResourceClient";
import { PreDefinedDataSourceIds } from "../model/templateModels";

export class DataSourceHandler {
    public getResultFromPreDefinedDataSourceId(dataSourceId: string, azureResourceClient: AzureResourceClient) {
        switch (dataSourceId) {
            case PreDefinedDataSourceIds.ACR.toString():
            case PreDefinedDataSourceIds.AKS.toString():
            case PreDefinedDataSourceIds.FunctionApp.toString():
            case PreDefinedDataSourceIds.LinuxApp.toString():
            case PreDefinedDataSourceIds.LinuxContainerApp.toString():
            case PreDefinedDataSourceIds.LinuxFunctionApp.toString():
            case PreDefinedDataSourceIds.WindowsApp.toString():
            default:

        }
    }
}