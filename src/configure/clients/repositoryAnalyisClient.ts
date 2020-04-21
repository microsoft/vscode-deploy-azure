import { RepositoryAnalysisRequest } from "../model/models";

export interface IRepositoryAnalysisClient {
    getRepositoryAnalysis(body: RepositoryAnalysisRequest): Promise<any>;
}
