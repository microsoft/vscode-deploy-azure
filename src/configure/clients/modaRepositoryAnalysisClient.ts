import { RepositoryAnalysis, SourceRepository } from "azureintegration_repoanalysis_client_internal";
import { RestClient } from "typed-rest-client";
import vscodeUri from "vscode-uri";
import { IRepositoryAnalysisClient } from "./repositoryAnalyisClient";

export class ModaRepositoryAnalysisClient implements IRepositoryAnalysisClient {
    private restClient: RestClient;
    private githubPat: string;
    private pathUrl: string;

    constructor(url: string, githubPat: string) {
        const u = vscodeUri.parse(url);
        this.restClient = new RestClient("deploy-to-azure", u.scheme + "://" + u.authority);
        this.pathUrl = u.path;
        this.githubPat = githubPat;
    }

    public async getRepositoryAnalysis(body: SourceRepository): Promise<RepositoryAnalysis> {
        const requestOptions = {
            acceptHeader: "application/json",
            additionalHeaders: {
                "Authorization": "Bearer " + this.githubPat
            }
        };
        return <RepositoryAnalysis>((await this.restClient.create(this.pathUrl, body, requestOptions)).result);
    }
}