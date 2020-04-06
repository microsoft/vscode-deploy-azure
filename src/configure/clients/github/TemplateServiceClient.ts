import { RepositoryAnalysisParameters } from "../../model/models";
import { PipelineTemplateMetadata } from "../../model/templateModels";
import { RestClient } from "../restClient";
import { PipelineTemplateNew } from "../../model/PipelineTemplateNew";

export class TemplateServiceClient {
    private restClient: RestClient;

    public constructor() {
        this.restClient = new RestClient();
    }

    public async getTemplates(body: RepositoryAnalysisParameters): Promise<PipelineTemplateMetadata[]> {
        return this.restClient.sendRequest2(
            'https://tswithouthmac.azurewebsites.net/Templates',
            'POST',
            '2019-05-01',
            body);
    }

    public async getTemplateById(templateId: string): Promise<PipelineTemplateNew> {
        return this.restClient.sendRequest2(
            'https://tswithouthmac.azurewebsites.net/Templates/' + templateId + '/parameters',
            'GET',
            '2019-05-01',
            null);
    }
}