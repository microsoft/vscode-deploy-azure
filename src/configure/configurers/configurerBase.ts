import { LocalGitRepoHelper } from "../helper/LocalGitRepoHelper";
import { ServiceConnectionType, WizardInputs } from "../model/models";

export interface Configurer {
    validatePermissions(): Promise<void>;
    getInputs(inputs: WizardInputs): Promise<void>;
    createPreRequisites(inputs: WizardInputs): Promise<void>;
    createSecretOrServiceConnection(
        name: string,
        type: ServiceConnectionType,
        data: any,
        inputs: WizardInputs): Promise<string>;
    getPathToPipelineFile(inputs: WizardInputs, localGitRepoHelper: LocalGitRepoHelper): Promise<string>;
    checkInPipelineFileToRepository(inputs: WizardInputs, localGitRepoHelper: LocalGitRepoHelper): Promise<string>;
    createAndQueuePipeline(inputs: WizardInputs): Promise<string>;
    executePostPipelineCreationSteps(inputs: WizardInputs): Promise<void>;
    browseQueuedPipeline(): Promise<void>;
}