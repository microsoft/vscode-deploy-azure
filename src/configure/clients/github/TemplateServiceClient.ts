import { RepositoryAnalysisParameters } from "../../model/models";
import { PipelineTemplateMetadata } from "../../model/templateModels";
import { RestClient } from "../restClient";

export class TemplateServiceClient {
    private restClient: RestClient;

    public constructor() {
        this.restClient = new RestClient();
    }

    public async getTemplates(body: RepositoryAnalysisParameters): Promise<PipelineTemplateMetadata[]> {
        return this.restClient.sendRequest2(
            'https://ts21.azurewebsites.net/Templates',
            'POST',
            '2019-05-01',
            body);
    }
}