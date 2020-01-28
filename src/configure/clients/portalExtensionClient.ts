import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from "ms-rest";
import { RestClient } from "./restClient";
import { RepositoryAnalysisRequest } from "../model/models";

export class PortalExtensionClient {

    private restClient: RestClient;

    constructor(credentials: ServiceClientCredentials) {
        this.restClient = new RestClient(credentials);
    }

    public async getRepositoryAnalysis(body: RepositoryAnalysisRequest): Promise<any> {

        //TODO Need to do few things once Repo Analysis service gets live 1. Update url and 2. Add and Test the Authorization header
        return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: `https://peprodscussu2.portalext.visualstudio.com/_apis/RepositoryAnalysis`,
            headers: {
                "Content-Type": "application/json"
            },
            method: "POST",
            queryParameters: {
                "api-version": "5.2-preview.1",
            },
            body: body,
            serializationMapper: null,
            deserializationMapper: null
        });
    }
}