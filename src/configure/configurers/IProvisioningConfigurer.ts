import { WizardInputs } from '../model/models';
import { DraftPipelineConfiguration, ProvisioningConfiguration } from '../model/provisioningConfiguration';

export interface IProvisioningConfigurer {
    queueProvisioningPipelineJob(provisioningConfiguration: ProvisioningConfiguration, wizardInputs: WizardInputs): Promise<ProvisioningConfiguration>;
    getProvisioningPipeline(jobId: string, githubOrg: string, repository: string, wizardInputs: WizardInputs): Promise<ProvisioningConfiguration>;
    postSteps(provisioningConfiguration: ProvisioningConfiguration, draftPipelineConfiguration: DraftPipelineConfiguration, inputs: WizardInputs): Promise<void>
    browseQueuedPipeline(): Promise<void>;
}
