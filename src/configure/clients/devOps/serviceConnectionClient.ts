import { UrlBasedRequestPrepareOptions } from 'ms-rest';
import { AadApplication, ParsedAzureResourceId } from '../../model/models';
import { AzureDevOpsBaseUrl } from "../../resources/constants";
import { AzureDevOpsClient } from './azureDevOpsClient';


export class ServiceConnectionClient {
    private azureDevOpsClient: AzureDevOpsClient;
    private organizationName: string;
    private projectName: string;

    constructor(organizationName: string, projectName: string, azureDevOpsClient: AzureDevOpsClient) {
        this.azureDevOpsClient = azureDevOpsClient;
        this.organizationName = organizationName;
        this.projectName = projectName;
    }

    public async createGitHubServiceConnection(endpointName: string, gitHubPat: string): Promise<any> {
        let url = `${AzureDevOpsBaseUrl}/${this.organizationName}/${this.projectName}/_apis/serviceendpoint/endpoints`;

        return this.azureDevOpsClient.sendRequest(<UrlBasedRequestPrepareOptions>
            {
                url: url,
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
                },
                method: "POST",
                body: {
                    "administratorsGroup": null,
                    "authorization": {
                        "parameters": {
                            "accessToken": gitHubPat
                        },
                        "scheme": "PersonalAccessToken"
                    },
                    "description": "",
                    "groupScopeId": null,
                    "name": endpointName,
                    "operationStatus": null,
                    "readersGroup": null,
                    "type": "github",
                    "url": "http://github.com"
                },
                deserializationMapper: null,
                serializationMapper: null
            });
    }

    public async createAzureSPNServiceConnection(endpointName: string, tenantId: string, subscriptionId: string, scope: string, aadApp: AadApplication): Promise<any> {
        let url = `${AzureDevOpsBaseUrl}/${this.organizationName}/${this.projectName}/_apis/serviceendpoint/endpoints`;

        return this.azureDevOpsClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: url,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
            },
            method: "POST",
            body: {
                "administratorsGroup": null,
                "authorization": {
                    "parameters": {
                        "authenticationType": "spnKey",
                        "scope": scope,
                        "serviceprincipalid": aadApp.appId,
                        "serviceprincipalkey": aadApp.secret,
                        "tenantid": tenantId
                    },
                    "scheme": "ServicePrincipal"
                },
                "data": {
                    "creationMode": "Manual",
                    "subscriptionId": subscriptionId,
                    "subscriptionName": subscriptionId
                },
                "description": "",
                "groupScopeId": null,
                "name": endpointName,
                "operationStatus": null,
                "readersGroup": null,
                "type": "azurerm",
                "url": "https://management.azure.com/"
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async createKubernetesServiceConnectionWithKubeConfig(endpointName: string, kubeconfig: string, apiServerAddress: string): Promise<any> {
        let url = `${AzureDevOpsBaseUrl}/${this.organizationName}/${this.projectName}/_apis/serviceendpoint/endpoints`;

        return this.azureDevOpsClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: url,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
            },
            method: "POST",
            body: {
                "administratorsGroup": null,
                "authorization": {
                    "parameters": {
                        "kubeconfig": kubeconfig
                    },
                    "scheme": "Kubernetes"
                },
                "data": {
                    "authorizationType": "Kubeconfig",
                    "acceptUntrustedCerts": "true",
                },
                "description": "",
                "groupScopeId": null,
                "name": endpointName,
                "operationStatus": null,
                "readersGroup": null,
                "type": "kubernetes",
                "url": apiServerAddress
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async createContainerRegistryServiceConnection(endpointName: string, registryUrl: string, registryUsername: string, registryPassword?: string): Promise<any> {
        let url = `${AzureDevOpsBaseUrl}/${this.organizationName}/${this.projectName}/_apis/serviceendpoint/endpoints`;

        return this.azureDevOpsClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: url,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
            },
            method: "POST",
            body: {
                "administratorsGroup": null,
                "authorization": {
                    "parameters": {
                        "registry": registryUrl,
                        "username": registryUsername,
                        "password": registryPassword,
                        "email": ""
                    },
                    "scheme": "UsernamePassword"
                },
                "data": {
                    "registryType": "Others"
                },
                "description": "",
                "groupScopeId": null,
                "name": endpointName,
                "operationStatus": null,
                "readersGroup": null,
                "type": "dockerregistry",
                "url": registryUrl
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async createAzurePublishProfileServiceConnection(endpointName: string, tenantId: string, resourceId: string, publishProfile: string): Promise<any> {
        let url = `${AzureDevOpsBaseUrl}/${this.organizationName}/${this.projectName}/_apis/serviceendpoint/endpoints`;
        let parsedResourceId = new ParsedAzureResourceId(resourceId);

        return this.azureDevOpsClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: url,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
            },
            method: "POST",
            body: {
                "administratorsGroup": null,
                "authorization": {
                    "parameters": {
                        "publishProfile": publishProfile,
                        "tenantid": tenantId
                    },
                    "scheme": "PublishProfile"
                },
                "data": {
                    "subscriptionName": parsedResourceId.subscriptionId,
                    "resourceId": resourceId
                },
                "description": "",
                "groupScopeId": null,
                "name": endpointName,
                "operationStatus": null,
                "readersGroup": null,
                "type": "azurerm",
                "url": "https://management.azure.com/"
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async getEndpointStatus(endpointId: string): Promise<any> {
        let url = `${AzureDevOpsBaseUrl}/${this.organizationName}/${this.projectName}/_apis/serviceendpoint/endpoints/${endpointId}`;

        return this.azureDevOpsClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: url,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
            },
            method: "Get",
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async authorizeEndpointForAllPipelines(endpointId: string): Promise<any> {
        let url = `${AzureDevOpsBaseUrl}/${this.organizationName}/${this.projectName}/_apis/pipelines/pipelinePermissions/endpoint/${endpointId}`;

        return this.azureDevOpsClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: url,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json;api-version=5.1-preview.1;excludeUrls=true;enumsAsNumbers=true;msDateFormat=true;noArrayWrap=true"
            },
            method: "PATCH",
            body: {
                "allPipelines": {
                    "authorized": true,
                    "authorizedBy": null,
                    "authorizedOn": null
                },
                "pipelines": null,
                "resource": {
                    "id": endpointId,
                    "type": "endpoint"
                }
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

}
