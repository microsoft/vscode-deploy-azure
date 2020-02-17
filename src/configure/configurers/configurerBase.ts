import { AzureResourceClient } from "../clients/azure/azureResourceClient";
import { LocalGitRepoHelper } from "../helper/LocalGitRepoHelper";
import { WizardInputs } from "../model/models";
import { TemplateAssetType } from "../model/templateModels";

export interface Configurer {
    validatePermissions(): Promise<void>;
    getInputs(inputs: WizardInputs): Promise<void>;
    createPreRequisites(inputs: WizardInputs, azureResourceClient: AzureResourceClient): Promise<void>;
    createAsset(
        name: string, 
        type: TemplateAssetType,
        data: any,
        inputs: WizardInputs): Promise<string>;
    getPathToPipelineFile(inputs: WizardInputs, localGitRepoHelper: LocalGitRepoHelper): Promise<string>;
    getPathToManifestFile(inputs: WizardInputs, localGitRepoHelper: LocalGitRepoHelper, fileName: string): Promise<string>;
    checkInPipelineFileToRepository(files:string[], inputs: WizardInputs, localGitRepoHelper: LocalGitRepoHelper): Promise<string>;
    createAndQueuePipeline(inputs: WizardInputs): Promise<string>;
    executePostPipelineCreationSteps(inputs: WizardInputs, azureResourceClient: AzureResourceClient): Promise<void>;
    browseQueuedPipeline(): Promise<void>;
}
