import { RepositoryAnalysis } from "azureintegration-repoanalysis-client-internal";
import { ServiceClientCredentials } from "ms-rest";
import { ExtendedPipelineTemplate } from "../../model/Contracts";
import { StringMap } from "../../model/models";
import { TemplateInfo } from "../../model/templateModels";
import { RestClient } from "../restClient";

export class TemplateServiceClient {
    private restClient: RestClient;
    private readonly templateServiceUri: string = "https://pepfcusc.portalext.visualstudio.com/_apis/TemplateService/";
    private readonly apiVersion = "6.0-preview.1";

    constructor(credentials: ServiceClientCredentials) {
        this.restClient = new RestClient();
    }

    public async getTemplates(body: RepositoryAnalysis): Promise<TemplateInfo[]> {
        return this.restClient.sendRequest2(
            this.templateServiceUri,
            'POST',
            this.apiVersion,
            body);
    }

    public async getTemplateParameters(templateId: string): Promise<ExtendedPipelineTemplate> {
        var requestUri = this.templateServiceUri + templateId + "/parameters";
        return this.restClient.sendRequest2(
            requestUri,
            'GET',
            this.apiVersion
        );
    }

    public async getTemplateConfiguration(templateId: string, inputs: StringMap<string>): Promise<ExtendedPipelineTemplate> {
        let requestUri = this.templateServiceUri + templateId + "/configuration";
        return this.restClient.sendRequest2(
            requestUri,
            'POST',
            this.apiVersion,
            inputs
        );
    }

    public async getTemplateFile(templateId: string, fileName: string): Promise<{ id: string, content: string }[]> {
        let requestUri = this.templateServiceUri + templateId + "/files";

        return this.restClient.sendRequest(
            {
                url: requestUri,
                method: 'GET',
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                },
                queryParameters: {
                    'fileNames': fileName,
                    'api-version': this.apiVersion
                },
                deserializationMapper: null,
                serializationMapper: null
            });
    }
}