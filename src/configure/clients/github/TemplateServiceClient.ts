import { ExtendedPipelineTemplate } from "../../model/Contracts";
import { RepositoryAnalysisParameters } from "../../model/models";
import { PipelineTemplateMetadata } from "../../model/templateModels";
import { RestClient } from "../restClient";

export class TemplateServiceClient {
    private restClient: RestClient;
    private  readonly templateServiceUri: string = "https://tswithouthmac.azurewebsites.net/Templates";

    public constructor() {
        this.restClient = new RestClient();
    }

    public async getTemplates(body: RepositoryAnalysisParameters): Promise<PipelineTemplateMetadata[]> {
        return this.restClient.sendRequest2(
            this.templateServiceUri,
            'POST',
            '2019-05-01',
            body);
    }

    public async getTemplateParameters(templateId: string): Promise<ExtendedPipelineTemplate> {
        var requestUri  = this.templateServiceUri + "/" + templateId + "/parameters";
        var extendedPipelineTemplate = await this.restClient.sendRequest2(
            requestUri,
            'GET',
            '2019-05-01'
        );
        //return extendedPipelineTemplate;
        var extendedPipelineTemplate2 =
          {
            "groups": [
                {
                    "id": "cdResource",
                    "name": "Existing resource on which CD is getting setup",
                    "properties": {
                        "context": "cdResource"
                    }
                },
                {
                    "id": "containerRegistry",
                    "name": "Container Registry",
                    "properties": {
                        "context": "service"
                    }
                },
                {
                    "id": "dockerInputs",
                    "name": "Application Settings",
                    "properties": {
                        "context": "application"
                    }
                }
            ],
            "dataSources": [
                {
                    "id": "listExistingAKS",
                    "endpointUrlStem": "/subscriptions/{{{inputs.subscriptionId}}}/providers/Microsoft.ContainerService/managedClusters?api-version=2018-03-31",
                    "httpMethod": "GET",
                    "resultSelector": "$.value",
                    "resultTemplate": "{\"DisplayValue\":\"{{{name}}}\", \"Value\":\"{{{id}}}\", \"Group\":\"{{#parseAzureResourceId}}{{{id}}} 4{{/parseAzureResourceId}}\"}"
                },
                {
                    "id": "httpApplicationRoutingDomain",
                    "endpointUrlStem": "{{{inputs.clusterId}}}?api-version=2018-03-31",
                    "httpMethod": null,
                    "requestBody": null,
                    "resultSelector": "$.properties.addonProfiles.httpApplicationRouting.config.HTTPApplicationRoutingZoneName",
                    "resultTemplate": null
                },
                {
                    "id": "kubernetesVersion",
                    "endpointUrlStem": "{{{inputs.clusterId}}}?api-version=2018-03-31",
                    "httpMethod": null,
                    "requestBody": null,
                    "resultSelector": "$.properties.kubernetesVersion",
                    "resultTemplate": null
                },
                {
                    "id": "getResourceGroupLocation",
                    "endpointUrlStem": "subscriptions/{{{inputs.subscriptionId}}}/resourceGroups//{{#parseAzureResourceId}}{{{inputs.clusterId}}} 4{{/parseAzureResourceId}}?api-version=2014-04-01-preview",
                    "httpMethod": "GET",
                    "resultTemplate": "{{{location}}}"
                },
                {
                    "id": "fetchExistingContainerRegistriesInSubscription",
                    "endpointUrlStem": "/subscriptions/{{{inputs.subscriptionId}}}/providers/Microsoft.ContainerRegistry/registries?api-version=2017-03-01",
                    "httpMethod": null,
                    "requestBody": null,
                    "resultSelector": "$.value.[?(@.type === 'Microsoft.ContainerRegistry/registries')]",
                    "resultTemplate": "{\"Value\":\"{{{id}}}\",\"DisplayValue\":\"{{{name}}}\"}"
                },
                {
                    "id": "fetchContainerRegistryLocations",
                    "endpointUrlStem": "/subscriptions/{{{inputs.subscriptionId}}}/providers/Microsoft.ContainerRegistry?api-version=2016-09-01",
                    "httpMethod": null,
                    "requestBody": null,
                    "resultSelector": "$.resourceTypes[?(@.resourceType === 'locations')].locations",
                    "resultTemplate": null
                },
                {
                    "id": "checkContainerRegistryAvailability",
                    "endpointUrlStem": "subscriptions/{{{inputs.subscriptionId}}}/providers/Microsoft.ContainerRegistry/checkNameAvailability?api-version=2017-10-01",
                    "httpMethod": "POST",
                    "requestBody": "{\"name\":\"{{{inputs.containerRegistryName}}}\",\"type\":\"Microsoft.ContainerRegistry/registries\"}",
                    "resultSelector": null,
                    "resultTemplate": "{\"value\":\"{{{nameAvailable}}}\",\"message\":\"{{{message}}}\"}"
                },
                {
                    "id": "getContainerRegistryResourceGroupLocation",
                    "endpointUrlStem": "/subscriptions/{{{inputs.subscriptionId}}}/resourceGroups/{{#parseAzureResourceId}}{{{inputs.existingContainerRegistryId}}} 4{{/parseAzureResourceId}}?api-version=2018-05-01",
                    "httpMethod": null,
                    "requestBody": null,
                    "resultSelector": "$.location",
                    "resultTemplate": null
                },
                {
                    "id": "checkDreamSparkQuotaId",
                    "endpointUrlStem": "subscriptions/{{{inputs.subscriptionId}}}?api-version=2014-04-01",
                    "httpMethod": "GET",
                    "requestBody": null,
                    "resultSelector": "$.subscriptionPolicies",
                    "resultTemplate": "{\"value\":\"{{#equals}}{{{quotaId}}} 'DreamSpark_2015-02-01' true false true{{/equals}}\"}"
                }
            ],
            "inputs": [
                {
                    "name": "Subscription",
                    "groupId": "cdResource",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {
                        "resourceProviders": "Microsoft.ContainerService;Microsoft.ContainerRegistry;Microsoft.Resources;Microsoft.Insights;Microsoft.OperationalInsights;Microsoft.OperationsManagement;Microsoft.Compute;Microsoft.Network;Microsoft.Storage;"
                    },
                    "inputMode": 30,
                    "dataSourceId": null,
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [
                        {
                            "dataSourceId": "checkDreamSparkQuotaId",
                            "resultTemplate": null,
                            "errorMessage": "The resource providers 'Microsoft.Storage' and 'Microsoft.ContainerRegistry' do not support DreamSpark subscriptions. Either select a different subscription or select a scenario where all the resource providers support DreamSpark subscriptions."
                        }
                    ],
                    "visibleRule": null,
                    "id": "subscriptionId",
                    "description": "Id of subscription where AKS cluster is present.",
                    "type": 0,
                    "possibleValues": []
                },
                {
                    "name": "Cluster name",
                    "groupId": "cdResource",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {
                      "cdResource": "true" 
                    },
                    "inputMode": 80,
                    "dataSourceId": "listExistingAKS",
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": null,
                    "id": "clusterId",
                    "description": "The name of the Azure Kubernetes Service cluster",
                    "type": "string",
                    "possibleValues": []
                },
                {
                    "name": "Resource group",
                    "groupId": "cdResource",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 10,
                    "dataSourceId": null,
                    "defaultValue": "{{#parseAzureResourceId}}{{{inputs.clusterId}}} 4{{/parseAzureResourceId}}",
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": "clusterId == empty",
                    "id": "resourceGroup",
                    "description": "Name of the resource group where AKS cluster is present.",
                    "type": "string",
                    "possibleValues": []
                },
                {
                    "name": "HTTP application routing domain",
                    "groupId": "cdResource",
                    "isRequired": false,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 0,
                    "dataSourceId": "httpApplicationRoutingDomain",
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": null,
                    "id": "httpApplicationRoutingDomain",
                    "description": "The HTTP application routing domain of Azure Kubernetes Service cluster",
                    "type": "string",
                    "possibleValues": []
                },
                {
                    "name": "kubernetes Version",
                    "groupId": "cdResource",
                    "isRequired": false,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 0,
                    "dataSourceId": "kubernetesVersion",
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": null,
                    "id": "kubernetesVersion",
                    "description": "The kubernetes version present in Azure Kubernetes Service cluster",
                    "type": 0,
                    "possibleValues": []
                },
                {
                    "name": "Location",
                    "groupId": "cdResource",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 10,
                    "dataSourceId": "getResourceGroupLocation",
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": "clusterId == empty",
                    "id": "location",
                    "description": "Choose the Azure region that's right for you and your customers.",
                    "type": "string",
                    "possibleValues": []
                },
                {
                    "name": "Container Registry Selection",
                    "groupId": "containerRegistry",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 80,
                    "dataSourceId": null,
                    "defaultValue": "true",
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": null,
                    "id": "reuseACR",
                    "description": null,
                    "type": 0,
                    "possibleValues": []
                },
                {
                    "name": "Container Registry Name",
                    "groupId": "containerRegistry",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 30,
                    "dataSourceId": "fetchExistingContainerRegistriesInSubscription",
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": "reuseACR == true",
                    "id": "existingContainerRegistryId",
                    "description": null,
                    "type": 0,
                    "possibleValues": []
                },
                {
                    "name": "ACR Resource group",
                    "groupId": "containerRegistry",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 10,
                    "dataSourceId": null,
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": "reuseACR == false",
                    "id": "acrResourceGroup",
                    "description": "Name of the resource group where Azure Container registry is present.",
                    "type": "string",
                    "possibleValues": []
                },
                {
                    "name": "Container Registry Resource Group Location",
                    "groupId": "containerRegistry",
                    "isRequired": false,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 10,
                    "dataSourceId": "getContainerRegistryResourceGroupLocation",
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": "reuseACR == invalid",
                    "id": "existingContainerRegistryResourceGroupLocation",
                    "description": null,
                    "type": 0,
                    "possibleValues": []
                },
                {
                    "name": "Container Registry Name",
                    "groupId": "containerRegistry",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 10,
                    "dataSourceId": null,
                    "defaultValue": "{{#parseAzureResourceId}}{{{inputs.clusterId}}} 6{{/parseAzureResourceId}}",
                    "staticValidation": {
                        "pattern": "[a-zA-Z0-9]*",
                        "regexFlags": null,
                        "errorMessage": "Resource names may contain alpha numeric characters only and must be between 5 and 50 characters.",
                        "minLength": 5,
                        "maxLength": 50
                    },
                    "dynamicValidations": [
                        {
                            "dataSourceId": "checkContainerRegistryAvailability",
                            "resultTemplate": null,
                            "errorMessage": "Registry with this name already exists."
                        }
                    ],
                    "visibleRule": "reuseACR == false",
                    "id": "containerRegistryName",
                    "description": null,
                    "type": 0,
                    "possibleValues": []
                },
                {
                    "name": "Container Registry SKU",
                    "groupId": "containerRegistry",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 30,
                    "dataSourceId": null,
                    "defaultValue": "Standard",
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": "reuseACR == false",
                    "id": "containerRegistrySKU",
                    "description": "Azure Container Registry is a private Docker registry for hosting container images. All SKUs provide the same programmatic capabilities. Choosing a higher SKU will provide more performance and scale. <a href='https://azure.microsoft.com/en-us/pricing/details/container-registry/' target='_blank'>More info on pricing and capabilities.</a>",
                    "type": 0,
                    "possibleValues": [
                        {
                            "value": "Basic",
                            "displayValue": "Basic"
                        },
                        {
                            "value": "Standard",
                            "displayValue": "Standard"
                        },
                        {
                            "value": "Premium",
                            "displayValue": "Premium"
                        }
                    ]
                },
                {
                    "name": "Container Registry Location",
                    "groupId": "containerRegistry",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 30,
                    "dataSourceId": "fetchContainerRegistryLocations",
                    "defaultValue": "South Central US",
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": "reuseACR == false",
                    "id": "containerRegistryLocation",
                    "description": null,
                    "type": 0,
                    "possibleValues": []
                },
                {
                    "name": null,
                    "groupId": null,
                    "isRequired": false,
                    "sublabel": null,
                    "properties": {
                        "scope": [
                            "{{#equals}}{{{inputs.reuseACR}}} false true '/subscriptions/{{{inputs.subscriptionId}}}/resourceGroups/{{{inputs.acrResourceGroup}}}'{{/equals}}{{#equals}}{{{inputs.reuseACR}}} true true '{{{inputs.existingContainerRegistryId}}}'{{/equals}}"
                        ],
                        "location": [
                            "{{inputs.location}}",
                            "{{#equals}}{{{inputs.reuseACR}}} true true '{{{inputs.existingContainerRegistryResourceGroupLocation}}}' {{/equals}}"
                        ]
                    },
                    "inputMode": 0,
                    "dataSourceId": null,
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": null,
                    "id": "azureAuth",
                    "description": "Authorization for Azure ARM endpoints.",
                    "type": 4,
                    "possibleValues": []
                },
                {
                    "name": null,
                    "groupId": null,
                    "isRequired": false,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 0,
                    "dataSourceId": null,
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": null,
                    "id": "azureDevOpsAuth",
                    "description": "Azure DevOps authorization",
                    "type": 4,
                    "possibleValues": []
                },
                {
                    "name": "Dockerfile path",
                    "groupId": "dockerInputs",
                    "isRequired": true,
                    "sublabel": null,
                    "properties": {

                    },
                    "inputMode": 10,
                    "dataSourceId": null,
                    "defaultValue": null,
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": null,
                    "id": "dockerFilePath",
                    "description": "The path to the Dockerfile used for building the container image. Minimatch patterns are supported, for example: **/Dockerfile. The complete path from the repository root to the Dockerfile can also be used. For example: Fabrikam/WebApp/Dockerfile.",
                    "type": 0,
                    "possibleValues": []
                },
                {
                    "name": "PORT",
                    "groupId": "dockerInputs",
                    "isRequired": false,
                    "sublabel": null,
                    "properties": {
                        
                    },
                    "inputMode": 10,
                    "dataSourceId": null,
                    "defaultValue": "",
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": null,
                    "id": "containerPort",
                    "description": "Specify port to expose in container.",
                    "type": 0,
                    "possibleValues": []
                },
                {
                    "name": "Docker build context",
                    "groupId": "dockerInputs",
                    "isRequired": false,
                    "sublabel": null,
                    "properties": {},
                    "inputMode": 10,
                    "dataSourceId": null,
                    "defaultValue": "",
                    "staticValidation": null,
                    "dynamicValidations": [],
                    "visibleRule": null,
                    "id": "dockerContext",
                    "description": "Specify the source directory path which will be used for building container.",
                    "type": "string",
                    "possibleValues": []
                }
            ],
            "id": "ms.vss-continuous-delivery-pipeline-templates.aks-cd-with-dockerfile-github",
            "description": "i18n:Template for configuring github workflow on an AKS cluster using dockerfile",
            "attributes": {
                "language": "Docker",
                "buildTarget": "Dockerfile",
                "deployTarget": "Azure:AKS",
                "serviceId": "ms.vss-continuous-delivery-pipeline-templates.service-type-aks",
                "templateType": "continuous-delivery",
                "pipelineType": "github",
                "codeRepositoryType": "BYOC"
            }
        };

        return extendedPipelineTemplate2 || extendedPipelineTemplate;
    }
}