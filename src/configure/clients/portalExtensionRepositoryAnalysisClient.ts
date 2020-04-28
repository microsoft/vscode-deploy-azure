import { RepositoryAnalysis, SourceRepository } from "azureintegration_repoanalysis_client_internal";
import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from "ms-rest";
import { IRepositoryAnalysisClient } from "./repositoryAnalyisClient";
import { RestClient } from "./restClient";

export class PortalExtensionRepositoryAnalysisClient implements IRepositoryAnalysisClient {
    private restClient: RestClient;
    private url: string;
    constructor(url: string, credentials: ServiceClientCredentials) {
        this.restClient = new RestClient(credentials);
        this.url = url;
    }

    public async getRepositoryAnalysis(body: SourceRepository): Promise<RepositoryAnalysis> {

        return this.restClient.sendRequest(<UrlBasedRequestPrepareOptions>{
            url: this.url,
            headers: {
                "Content-Type": "application/json"
            },
            method: "POST",
            body: body,
            serializationMapper: null,
            deserializationMapper: null
        });
    }
}