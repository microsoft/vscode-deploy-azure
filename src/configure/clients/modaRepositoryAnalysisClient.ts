import { RestClient } from "typed-rest-client";
import vscodeUri from "vscode-uri";
import { RepositoryAnalysisRequest, RepositoryAnalysisResponse } from "../model/models";
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

    public async getRepositoryAnalysis(body: RepositoryAnalysisRequest): Promise<RepositoryAnalysisResponse> {
        const requestOptions = {
            acceptHeader: "application/json",
            additionalHeaders: {
                "Authorization": "Bearer " + this.githubPat
            }
        };
        return <RepositoryAnalysisResponse>((await this.restClient.create(this.pathUrl, body, requestOptions)).result);
    }
}