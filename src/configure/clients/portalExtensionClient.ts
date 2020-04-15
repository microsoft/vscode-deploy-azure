import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from "ms-rest";
import { RepositoryAnalysisRequest } from "../model/models";
import { RestClient } from "./restClient";

export class PortalExtensionClient {

    private restClient: RestClient;

    constructor(credentials: ServiceClientCredentials) {
        this.restClient = new RestClient(credentials);
    }

    public async getRepositoryAnalysis(body: RepositoryAnalysisRequest): Promise<any> {

        return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: `https://pe1.portalext.vsts.me/_apis/RepositoryAnalysis`,
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