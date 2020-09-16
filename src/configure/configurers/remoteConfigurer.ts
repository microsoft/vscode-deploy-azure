import * as fs from 'fs';
import * as Path from 'path';
import * as utils from 'util';
import * as vscode from 'vscode';
import { UserCancelledError } from 'vscode-azureextensionui';
import { IProvisioningServiceClient } from "../clients/IProvisioningServiceClient";
import { ProvisioningServiceClientFactory } from "../clients/provisioningServiceClientFactory";
import { sleepForMilliSeconds } from '../helper/commonHelper';
import { LocalGitRepoHelper } from '../helper/LocalGitRepoHelper';
import { telemetryHelper } from '../helper/telemetryHelper';
import { WizardInputs } from "../model/models";
import { CompletePipelineConfiguration, DraftPipelineConfiguration, File, ProvisioningConfiguration } from "../model/provisioningConfiguration";
import { Messages } from '../resources/messages';
import { TelemetryKeys } from '../resources/telemetryKeys';
import { TracePoints } from '../resources/tracePoints';
import { IRemoteConfigurerBase } from "./remoteConfigurerBase";

// tslint:disable-next-line:interface-name
interface DraftFile {
    content: string;
    path: string;
    absPath: string;
}

const Layer: string = "RemoteConfigurer";
export class RemoteConfigurer implements IRemoteConfigurerBase {
    private provisioningServiceClient: IProvisioningServiceClient;
    private queuedPipelineUrl: string;
    private refreshTime: number = 5 * 1000;
    private localGitRepoHelper: LocalGitRepoHelper;
    private filesToCommit: DraftFile[] = [];

    constructor(localGitRepoHelper: LocalGitRepoHelper){
        this.localGitRepoHelper = localGitRepoHelper;
    }

    public async createProvisioningPipeline(provisioningConfiguration: ProvisioningConfiguration, wizardInputs: WizardInputs): Promise<ProvisioningConfiguration>{
        try {
            this.provisioningServiceClient =  await ProvisioningServiceClientFactory.getClient(wizardInputs.githubPATToken, wizardInputs.azureSession.credentials);
            const OrgAndRepoDetails = wizardInputs.sourceRepository.repositoryId.split('/');
            return await this.provisioningServiceClient.createProvisioningConfiguration(provisioningConfiguration, OrgAndRepoDetails[0], OrgAndRepoDetails[1]);
        } catch (error){
            telemetryHelper.logError(Layer, TracePoints.UnableToCreateProvisioningPipeline, error);
            throw error;
        }
    }

    public async getProvisioningPipeline(jobId: string, githubOrg: string, repository: string, wizardInputs: WizardInputs): Promise<ProvisioningConfiguration>{
       try {
        this.provisioningServiceClient =  await ProvisioningServiceClientFactory.getClient(wizardInputs.githubPATToken, wizardInputs.azureSession.credentials);
        return await this.provisioningServiceClient.getProvisioningConfiguration(jobId, githubOrg, repository);
       } catch (error){
            telemetryHelper.logError(Layer, TracePoints.UnabletoGetProvisioningPipeline, error);
            throw error;
       }
    }

    public async checkProvisioningPipeline(jobId: string, githubOrg: string, repository: string, wizardInputs: WizardInputs): Promise<ProvisioningConfiguration> {
        try {
            const provisioningServiceResponse = await this.getProvisioningPipeline(jobId, githubOrg, repository, wizardInputs);
            if ( provisioningServiceResponse.result.status ===  "Queued" ||  provisioningServiceResponse.result.status == "InProgress") {
               await sleepForMilliSeconds(this.refreshTime);
               return await this.checkProvisioningPipeline(jobId, githubOrg, repository, wizardInputs);
            } else if (provisioningServiceResponse.result.status ===  "Failed") {
               throw new Error(provisioningServiceResponse.result.message) ;
            } else {
                return provisioningServiceResponse;
            }
        } catch (error) {
            throw error;
        }
    }

    public async browseQueuedPipeline(): Promise<void> {
        vscode.window.showInformationMessage(Messages.githubWorkflowSetupSuccessfully, Messages.browseWorkflow)
            .then((action: string) => {
                if (action && action.toLowerCase() === Messages.browseWorkflow.toLowerCase()) {
                    telemetryHelper.setTelemetry(TelemetryKeys.BrowsePipelineClicked, 'true');
                    vscode.env.openExternal(vscode.Uri.parse(this.queuedPipelineUrl));
                }
            });
    }

    public async postSteps(provisioningConfiguration: ProvisioningConfiguration, draftPipelineConfiguration: DraftPipelineConfiguration, inputs: WizardInputs): Promise<void> {
        await this.getFileToCommit(draftPipelineConfiguration);
        await this.showPipelineFiles();
        let displayMessage = Messages.modifyAndCommitFile;
        if (this.filesToCommit.length > 1) {
            displayMessage = Messages.modifyAndCommitMultipleFiles;
        }

        const commitOrDiscard = await vscode.window.showInformationMessage(
            utils.format(displayMessage, Messages.commitAndPush, inputs.sourceRepository.branch, inputs.sourceRepository.remoteName),
            Messages.commitAndPush,
            Messages.discardPipeline);
        let provisioningServiceResponse: ProvisioningConfiguration;
        if (!!commitOrDiscard && commitOrDiscard.toLowerCase() === Messages.commitAndPush.toLowerCase()) {
             provisioningServiceResponse = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: Messages.configuringPipelineAndDeployment }, async () => {
                try {
                    provisioningConfiguration.draftPipelineConfiguration = await this.createFilesToCheckin(draftPipelineConfiguration.id, draftPipelineConfiguration.type);
                    const completeProvisioningSvcResp = await this.createProvisioningPipeline(provisioningConfiguration, inputs);
                    if ( completeProvisioningSvcResp.id != undefined ){
                        const OrgAndRepoDetails = inputs.sourceRepository.repositoryId.split('/');
                        return await this.checkProvisioningPipeline(completeProvisioningSvcResp.id, OrgAndRepoDetails[0], OrgAndRepoDetails[1], inputs);
                    } else {
                        throw new Error("Failed to configure pipeline");
                    }
                } catch (error) {
                    telemetryHelper.logError(Layer, TracePoints.RemotePipelineConfiguringFailed, error);
                    vscode.window.showErrorMessage(utils.format(Messages.ConfiguringPipelineFailed, error.message));
                    return null;
                }
            });
            } else {
                telemetryHelper.setTelemetry(TelemetryKeys.PipelineDiscarded, 'true');
                throw new UserCancelledError(Messages.operationCancelled);
            }

        if ( provisioningServiceResponse != undefined) {
            this.setQueuedPipelineUrl(provisioningServiceResponse, inputs);
        } else {
            throw new Error("Failed to configure provisoining pipeline");
        }
    }

    public async showPipelineFiles(): Promise<void> {
        this.filesToCommit.forEach(async (file) => {
            await this.localGitRepoHelper.addContentToFile(file.content, file.absPath);
            await vscode.window.showTextDocument(vscode.Uri.file(file.absPath));
        });
    }

    public setQueuedPipelineUrl(provisioningConfiguration: ProvisioningConfiguration, inputs: WizardInputs){
      const commitId = (provisioningConfiguration.result.pipelineConfiguration as CompletePipelineConfiguration).commitId;
      this.queuedPipelineUrl = `https://github.com/${inputs.sourceRepository.repositoryId}/commit/${commitId}/checks`;
    }

    public async  getFileToCommit(draftPipelineConfiguration: DraftPipelineConfiguration): Promise<void> {
        let destination: string;
        for (const file of draftPipelineConfiguration.files ) {
            destination = await this.getPathToFile(Path.basename(file.path), Path.dirname(file.path));
            const decodedData = new Buffer(file.content, 'base64').toString('utf-8');
            this.filesToCommit.push({absPath: destination, content: decodedData, path: file.path} as DraftFile);
        }
    }

    public async getPathToFile( fileName: string, directory: string) {
        const dirList = directory.split("/"); // Hardcoded as provisioning service is running on linux and we cannot use Path.sep as it is machine dependent
        let directoryPath: string = "";
        directoryPath = await this.localGitRepoHelper.getGitRootDirectory();
        dirList.forEach((dir) => {
            try {
                directoryPath = Path.join(directoryPath, dir);
                // tslint:disable-next-line:non-literal-fs-path
                if (!fs.existsSync(directoryPath)) {
                    // tslint:disable-next-line:non-literal-fs-path
                    fs.mkdirSync(directoryPath);
                }
            }
            catch (error) {
                throw error;
            }
        });
        telemetryHelper.setTelemetry(TelemetryKeys.WorkflowFileName, fileName);
        return Path.join(directoryPath, fileName);
    }

    public async CreatePreRequisiteParams(wizardInputs: WizardInputs): Promise<void>{
        const parsedCredentials: { [key: string]: any } = JSON.parse(JSON.stringify(wizardInputs.azureSession.credentials));
        wizardInputs.pipelineConfiguration.params["armAuthToken"] = "Bearer " + parsedCredentials["tokenCache"]["target"]["_entries"][0]["accessToken"];
        wizardInputs.pipelineConfiguration.params["containerPort"]  = JSON.stringify(wizardInputs.pipelineConfiguration.params["containerPort"]);
      // TO DO:  wizardInputs.pipelineConfiguration.params["azureAuth"] = await this.getAzureSPNSecret(wizardInputs);
    }

   // tslint:disable-next-line:no-reserved-keywords
   private async createFilesToCheckin(id: string, type: string): Promise<DraftPipelineConfiguration>{
       const files: File[] = [];
       for ( const file of this.filesToCommit){
           const fileContent = await this.localGitRepoHelper.readFileConetent(file.absPath);
           const encodedContent = new Buffer(fileContent, 'utf-8').toString('base64');
           files.push({path: file.path, content: encodedContent});
        }

       return {
            id,
            type,
            files,
        } as DraftPipelineConfiguration;
   }
}
