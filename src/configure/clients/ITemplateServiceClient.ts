import { RepositoryAnalysis } from "azureintegration-repoanalysis-client-internal";
import { ExtendedPipelineTemplate } from "../model/Contracts";
import { StringMap } from "../model/models";
import { TemplateInfo } from "../model/templateModels";

export interface ITemplateServiceClient {
    getTemplates(body: RepositoryAnalysis): Promise<TemplateInfo[]>;
    getTemplateParameters(templateId: string): Promise<ExtendedPipelineTemplate>;
    getTemplateConfiguration(templateId: string, inputs: StringMap<string>): Promise<ExtendedPipelineTemplate>;
    getTemplateFile(templateId: string, fileName: string): Promise<{ id: string, content: string }[]>;
    getTemplatesInfoByFilter(language: string, deployTargetFilter?: string, buildTargetFilter?: string): Promise<TemplateInfo[]>;
}
