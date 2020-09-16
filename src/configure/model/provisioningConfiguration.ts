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
<<<<<<< HEAD
  branch: string;
=======
  repository: CodeRepository;
>>>>>>> e44232fe504c5b595f42d2c6c142499652a3d062
  provisioningMode: provisioningMode;
  draftPipelineConfiguration?: DraftPipelineConfiguration;
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
