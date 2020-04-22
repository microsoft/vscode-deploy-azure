import { RepositoryAnalysisRequest, RepositoryAnalysisResponse } from "../model/models";

export interface IRepositoryAnalysisClient {
    getRepositoryAnalysis(body: RepositoryAnalysisRequest): Promise<RepositoryAnalysisResponse>;
}
