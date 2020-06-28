import { RepositoryAnalysis } from "azureintegration-repoanalysis-client-internal";
import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from "ms-rest";
import { ExtendedPipelineTemplate } from "../../model/Contracts";
import { StringMap } from "../../model/models";
import { TemplateInfo } from "../../model/templateModels";
import { ITemplateServiceClient } from "../ITemplateServiceClient";
import { RestClient } from "../restClient";

export class TemplateServiceClient implements ITemplateServiceClient {
    private restClient;
    private templateServiceUri: string;
    private readonly apiVersion = "6.0-preview.1";
    private readonly extendedPipelineTemplateResource = "ExtendedPipelineTemplates";
    private readonly templatesInfoResource = "TemplatesInfo";
    private readonly templateAssetFilesResource = "TemplateAssetFiles";

    constructor(url: string, creds?: ServiceClientCredentials, headers?) {
        this.restClient = new RestClient(creds);
        this.templateServiceUri = url;
        this.restClient.headers = headers;
    }

    public async getTemplates(body: RepositoryAnalysis): Promise<TemplateInfo[]> {
        return this.restClient.sendRequest2(
            this.templateServiceUri + this.templatesInfoResource,
            'POST',
            this.apiVersion,
            body);
    }

    public async getTemplateParameters(templateId: string): Promise<ExtendedPipelineTemplate> {
        const requestUri = this.templateServiceUri + this.extendedPipelineTemplateResource;
        return this.restClient.sendRequest(
            {
                url: requestUri,
                method: 'GET',
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                },
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
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                },
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
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                },
                queryParameters: {
                    'templateId': templateId,
                    'fileNames': fileName,
                    'api-version': this.apiVersion
                },
                deserializationMapper: null,
                serializationMapper: null
            });
    }

    public async testFunc(): Promise<any> {
        // const creds = new TokenCredentials("32e8116c97a0d23f12ecab308d3686c169472e5e", "token");
        //const localclient = new RestClient(new TokenCredentials("32e8116c97a0d23f12ecab308d3686c169472e5e", "token"));
        let options: UrlBasedRequestPrepareOptions = {
            //url: GitHubProvider.getFormattedGitHubApiUrlBase("https://api.github.com/user/orgs"),
            url: "https://api.github.com/user/orgs",
            method: 'GET',
            queryParameters: {
            },
            deserializationMapper: null,
            serializationMapper: null
        };
        //const localclient = new RestClient();
        return await this.restClient.sendRequest(options).then(function (value) {
            console.log(value);
        }, function (reason) {
            console.log(reason);
        }).catch(function (reason) {
            console.log(reason);
        });


    }

}