import { AzureSession, ParsedAzureResourceId } from '../../model/models';
import { XmlResponseFilter } from '../filters/xmlResponseFilter';
import { RestClient } from '../restClient';

export class ArmRestClient {
    private resourceManagerEndpointUrl: string;
    private restClient: RestClient;

    public constructor(azureSession: AzureSession) {
        this.resourceManagerEndpointUrl = azureSession.environment.resourceManagerEndpointUrl;
        this.restClient = new RestClient(azureSession.credentials, { filters: [XmlResponseFilter.CREATE()] });
    }

    public fetchArmData(endPointUri: string, httpMethod: string, body?: any) {
        return this.sendRequest(
            this.resourceManagerEndpointUrl + endPointUri,
            httpMethod,
            null,
            body
        );
    }

    public async getAcrCredentials(acrId: string): Promise<any> {
        let parsedResourceId = new ParsedAzureResourceId(acrId);
        return this.sendRequest(
            this.resourceManagerEndpointUrl + `/subscriptions/${parsedResourceId.subscriptionId}/resourceGroups/${parsedResourceId.resourceGroup}/providers/Microsoft.ContainerRegistry/registries/${parsedResourceId.resourceName}/listCredentials`,
            'POST',
            '2019-05-01',
            null);
    }

    public async getAksKubeConfig(clusterId: string): Promise<any> {
        let parsedResourceId = new ParsedAzureResourceId(clusterId);
        return this.sendRequest(
            this.resourceManagerEndpointUrl + `/subscriptions/${parsedResourceId.subscriptionId}/resourceGroups/${parsedResourceId.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${parsedResourceId.resourceName}/listClusterAdminCredential`,
            'POST',
            '2020-01-01',
            null);
    }

    public async getWebAppPublishProfileXml(webAppresourceId: string): Promise<any> {
        const parsedResourceId: ParsedAzureResourceId = new ParsedAzureResourceId(webAppresourceId);
        return this.restClient.sendRequest2(
            this.resourceManagerEndpointUrl + `/subscriptions/${parsedResourceId.subscriptionId}/resourceGroups/${parsedResourceId.resourceGroup}/providers/Microsoft.Web/sites/${parsedResourceId.resourceName}/publishxml`,
            'POST',
            '2018-11-01',
            null);
    }

    private async sendRequest(url: string, httpMethod: string, apiVersion: string, body?: any): Promise<any> {
        return this.restClient.sendRequest(
            {
                url: url,
                method: httpMethod,
                headers: {
                    "Content-Type": "application/json"
                },
                queryParameters: {
                    'api-version': apiVersion
                },
                body: body,
                deserializationMapper: null,
                serializationMapper: null
            });
    }
}