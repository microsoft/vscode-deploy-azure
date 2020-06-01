import { RepositoryAnalysis, SourceRepository } from "azureintegration-repoanalysis-client-internal";

export interface IRepositoryAnalysisClient {
    getRepositoryAnalysis(body: SourceRepository): Promise<RepositoryAnalysis>;
}
