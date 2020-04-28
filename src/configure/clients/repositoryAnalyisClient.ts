import { RepositoryAnalysis, SourceRepository } from "azureintegration_repoanalysis_client_internal";

export interface IRepositoryAnalysisClient {
    getRepositoryAnalysis(body: SourceRepository): Promise<RepositoryAnalysis>;
}
