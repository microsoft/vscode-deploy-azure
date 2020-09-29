import { RepositoryAnalysis } from "azureintegration-repoanalysis-client-internal";
import { ServiceClientCredentials } from "ms-rest";
import { ExtendedPipelineTemplate } from "../../model/Contracts";
import { StringMap } from "../../model/models";
import { TemplateInfo } from "../../model/templateModels";
import { ITemplateServiceClient } from "../ITemplateServiceClient";
import { RestClient } from "../restClient";

export class TemplateServiceClient implements ITemplateServiceClient {
    private restClient: RestClient;
    private templateServiceUri: string;
    private headers;
    private readonly apiVersion = "6.0-preview.1";
    private readonly extendedPipelineTemplateResource = "ExtendedPipelineTemplates";
    private readonly templatesInfoResource = "TemplatesInfo";
    private readonly templateAssetFilesResource = "TemplateAssetFiles";

    constructor(url: string, creds?: ServiceClientCredentials, headers?) {
        this.restClient = new RestClient(creds);
        this.templateServiceUri = url;
        this.headers = headers;
    }

    public async getResourceFilteredTemplates(language: string, deployTarget: string): Promise<TemplateInfo[]> {
        return this.restClient.sendRequest(
            {
                url: this.templateServiceUri + this.templatesInfoResource,
                method: 'GET',
                headers: this.headers,
                queryParameters: {
                    'api-version': this.apiVersion,
                    'languageFilter': language,
                    'deployTargetFilter': deployTarget
                },
                deserializationMapper: null,
                serializationMapper: null
            });
    }

    public async getTemplates(body: RepositoryAnalysis): Promise<TemplateInfo[]> {
        return this.restClient.sendRequest(
            {
                url: this.templateServiceUri + this.templatesInfoResource,
                method: 'POST',
                headers: this.headers,
                queryParameters: {
                    'api-version': this.apiVersion
                },
                body: body,
                deserializationMapper: null,
                serializationMapper: null
            });
    }

    public async getTemplateParameters(templateId: string): Promise<ExtendedPipelineTemplate> {
        const requestUri = this.templateServiceUri + this.extendedPipelineTemplateResource;
        return this.restClient.sendRequest(
            {
                url: requestUri,
                method: 'GET',
                headers: this.headers,
                queryParameters: {
                    'templateId': templateId,
                    'templatePartToGet': 'parameters',
                    'api-version': this.apiVersion
                },
                deserializationMapper: null,
                serializationMapper: null
            });
    }

    public async getTemplateConfiguration(templateId: string, inputs: StringMap<string>): Promise<ExtendedPipelineTemplate> {
        const requestUri = this.templateServiceUri + this.extendedPipelineTemplateResource;
        return this.restClient.sendRequest(
            {
                url: requestUri,
                method: 'POST',
                headers: this.headers,
                queryParameters: {
                    'templateId': templateId,
                    'templatePartToGet': 'configuration',
                    'api-version': this.apiVersion
                },
                body: inputs,
                deserializationMapper: null,
                serializationMapper: null
            });
    }

    public async getTemplateFile(templateId: string, fileName: string): Promise<{ id: string, content: string }[]> {
        const requestUri = this.templateServiceUri + this.templateAssetFilesResource;

        return this.restClient.sendRequest(
            {
                url: requestUri,
                method: 'GET',
                headers: this.headers,
                queryParameters: {
                    'templateId': templateId,
                    'fileNames': fileName,
                    'api-version': this.apiVersion
                },
                deserializationMapper: null,
                serializationMapper: null
            });
    }

}