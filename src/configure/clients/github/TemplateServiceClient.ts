import { RepositoryAnalysis } from "azureintegration-repoanalysis-client-internal";
import { ServiceClientCredentials } from "ms-rest";
import { ExtendedPipelineTemplate } from "../../model/Contracts";
import { PipelineTemplateMetadata } from "../../model/templateModels";
import { RestClient } from "../restClient";

export class TemplateServiceClient {
    private restClient: RestClient;
    private readonly templateServiceUri: string = "https://pepfcusc.portalext.visualstudio.com/_apis/TemplateService";

    constructor(credentials: ServiceClientCredentials) {
        this.restClient = new RestClient(credentials);
    }

    public async getTemplates(body: RepositoryAnalysis): Promise<PipelineTemplateMetadata[]> {
        return this.restClient.sendRequest2(
            this.templateServiceUri,
            'POST',
            '6.0-preview.1',
            body);
    }

    public async getTemplateParameters(templateId: string): Promise<ExtendedPipelineTemplate> {
        var requestUri = this.templateServiceUri + "/" + templateId + "/parameters";
        return this.restClient.sendRequest2(
            requestUri,
            'GET',
            '6.0-preview.1'
        );
    }
}