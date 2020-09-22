export interface Authorization {
  scheme: string;
  parameters: { [key: string]: string };
}

export interface CodeRepository {
  id: string;
  // tslint:disable-next-line:no-reserved-keywords
  type: string;
  defaultBranch: string;
  authorizationInfo: Authorization;
}

export interface ProvisioningConfiguration {
  id: string;
  pipelineTemplateId: string;
  pipelineTemplateParameters: { [key: string]: string };
  branch: string;
  provisioningMode: provisioningMode;
  pipelineConfiguration?: DraftPipelineConfiguration;
  result?: Result;
}

export enum provisioningMode {
  draft = "draft",
  complete = "complete",
}

export interface PipelineConfiguration {
  id: string;
  // tslint:disable-next-line:no-reserved-keywords
  type: string;
}

export interface CompletePipelineConfiguration extends PipelineConfiguration {
  path: string;
  commitId: string;
}

export interface DraftPipelineConfiguration extends PipelineConfiguration {
  files: File[];
}

export interface File {
  content: string;
  path: string;
}

export interface Result {
  status: string;
  message: string;
  pipelineConfiguration: PipelineConfiguration;
}
