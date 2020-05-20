import { ServiceClientCredentials } from "ms-rest";
import { ExtendedPipelineTemplate } from "../../model/Contracts";
import { RepositoryAnalysisParameters, StringMap } from "../../model/models";
import { TemplateInfo } from "../../model/templateModels";
import { RestClient } from "../restClient";

export class TemplateServiceClient {
    private restClient: RestClient;
    private readonly templateServiceUri: string = "https://pepfcusc.portalext.visualstudio.com/_apis/TemplateService";

    constructor(credentials: ServiceClientCredentials) {
        this.restClient = new RestClient(credentials);
    }

    public async getTemplates(body: RepositoryAnalysisParameters): Promise<TemplateInfo[]> {
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

    public async getTemplateConfiguration(templateId: string, inputs: StringMap<string>): Promise<ExtendedPipelineTemplate> {
        let requestUri = this.templateServiceUri + "/" + templateId + "/configuration";
        return this.restClient.sendRequest2(
            requestUri,
            'POST',
            '6.0-preview.1',
            inputs
        );
    }

    public async getTemplateFile(templateId: string, fileId: string): Promise<string> {
        let requestUri = this.templateServiceUri + "/" + templateId + "/files" + fileId;
        return this.restClient.sendRequest2(
            requestUri,
            'GET',
            '6.0-preview.1'
        );
    }
}