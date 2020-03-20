import { RepoInfo } from "../model/models";
import { RestClient } from "./restClient";

export class TemplateServiceClient {
    private restClient: RestClient;

    public constructor() {
        this.restClient = new RestClient();
    }

    public async getTemplates(body: RepoInfo): Promise<any> {
        return this.restClient.sendServiceRequest(
            'https://ts21.azurewebsites.net/Templates',
            'POST',
            '2019-05-01',
            body);
    }
}