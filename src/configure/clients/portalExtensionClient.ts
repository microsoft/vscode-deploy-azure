import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from "ms-rest";
import { RestClient } from "./restClient";
import { RepositoryAnalysisRequest } from "../model/models";

export class PortalExtensionClient {

    private restClient: RestClient;

    constructor(credentials: ServiceClientCredentials) {
        this.restClient = new RestClient(credentials);
    }

    public async getRepositoryAnalysis(request: RepositoryAnalysisRequest): Promise<any> {

        //TODO Need to do few things once Repo Analysis service gets live 1. Update url and 2. Add and Test the Authorization header
        return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: `https://portalext.codedev.ms/_apis/RepositoryAnalysis?api-version=5.2-preview.1`,
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            queryParameters: {
                'api-version': '5.2-preview.1'
            },
            body: request,
            serializationMapper: null,
            deserializationMapper: null
        });
    }
}