import { ServiceClientCredentials } from "ms-rest";
import { RepositoryAnalysisParameters } from "../../model/models";
import { PipelineTemplateMetadata } from "../../model/templateModels";
import { RestClient } from "../restClient";

export class TemplateServiceClient {
    private restClient: RestClient;
    private readonly templateServiceUri: string = "https://pepfcusc.portalext.visualstudio.com/_apis/TemplateService";

    constructor(credentials: ServiceClientCredentials) {
        this.restClient = new RestClient(credentials);
    }

    public async getTemplates(body: RepositoryAnalysisParameters): Promise<PipelineTemplateMetadata[]> {
        return this.restClient.sendRequest2(
            this.templateServiceUri,
            'POST',
            '6.0-preview.1',
            body);
    }

    public async getTemplateParameters(templateId: string): Promise<any> {
        var requestUri = this.templateServiceUri + "/" + templateId + "/parameters";
        return this.restClient.sendRequest2(
            requestUri,
            'GET',
            '6.0-preview.1'
        );
    }
}