import * as Path from 'path';
import * as utils from 'util';
import * as vscode from 'vscode';
import { AppServiceClient } from '../clients/azure/appServiceClient';
import { AzureResourceClient } from "../clients/azure/azureResourceClient";
import { GithubClient } from '../clients/github/githubClient';
import { ITemplateServiceClient } from '../clients/ITemplateServiceClient';
import { TemplateServiceClientFactory } from '../clients/TemplateServiceClientFactory';
import { LocalGitRepoHelper } from '../helper/LocalGitRepoHelper';
import { MustacheHelper } from '../helper/mustacheHelper';
import { telemetryHelper } from '../helper/telemetryHelper';
import { Asset, ConfigurationStage, InputDataType } from "../model/Contracts";
import { AzureSession, ParsedAzureResourceId, StringMap, WizardInputs } from "../model/models";
import { RemotePipelineTemplate } from "../model/templateModels";
import { Messages } from '../resources/messages';
import { TracePoints } from '../resources/tracePoints';
import { InputControl } from '../templateInputHelper/InputControl';
import * as templateConverter from '../utilities/templateConverter';
import * as nodeVersionConverter from '../utilities/webAppNodeVersionConverter';
import { LocalGitHubWorkflowConfigurer } from './localGithubWorkflowConfigurer';

export interface File {
    path: string;
    content: string;
}

const Layer: string = "RemoteGitHubWorkflowConfigurer";

export class RemoteGitHubWorkflowConfigurer extends LocalGitHubWorkflowConfigurer {
    private azureSession: AzureSession;
    private assets: { [key: string]: any } = {};
    private inputs: WizardInputs;
    private secrets: { [key: string]: any } = {};
    private variables: { [key: string]: any } = {};
    private system: { [key: string]: any } = {};
    private filesToCommit: File[] = [];
    private mustacheContext: StringMap<any>;
    private template: RemotePipelineTemplate;
    private localGitHelper: LocalGitRepoHelper;
    private templateServiceClient: ITemplateServiceClient;

    constructor(azureSession: AzureSession, subscriptionId: string, localGitHelper: LocalGitRepoHelper) {
        super(azureSession, subscriptionId);
        this.azureSession = azureSession;
        this.localGitHelper = localGitHelper;
    }

    public async getInputs(wizardInputs: WizardInputs): Promise<void> {
        this.inputs = wizardInputs;
        this.githubClient = new GithubClient(wizardInputs.githubPATToken, wizardInputs.sourceRepository.remoteUrl);
        this.templateServiceClient = await TemplateServiceClientFactory.getClient(wizardInputs.azureSession.credentials, wizardInputs.githubPATToken);
        this.template = wizardInputs.pipelineConfiguration.template as RemotePipelineTemplate;
        let extendedPipelineTemplate;
        try {
            extendedPipelineTemplate = await this.templateServiceClient.getTemplateConfiguration(this.template.id, wizardInputs.pipelineConfiguration.params);
        } catch (error) {
            telemetryHelper.logError(Layer, TracePoints.UnableToGetTemplateConfiguration, error);
            throw error;

        }
        this.template.configuration = templateConverter.convertToLocalMustacheExpression(extendedPipelineTemplate.configuration);

        this.template.configuration.assets.forEach((asset: Asset) => {
            if (!asset.stage) {
                asset.stage = ConfigurationStage.Pre;
            }
        });

        this.system["sourceRepository"] = wizardInputs.sourceRepository;

        this.mustacheContext = {
            inputs: wizardInputs.pipelineConfiguration.params,
            variables: this.variables,
            assets: this.assets,
            secrets: this.secrets,
            system: this.system
        }

        for (let variable of this.template.configuration.variables) {
            let expression = variable.value;
            let value = MustacheHelper.render(expression, this.mustacheContext);
            this.variables[variable.id] = value;
        }
    }

    public async createPreRequisites(inputs: WizardInputs, azureResourceClient: AzureResourceClient) {
        return null;
    }

    public async createAssets(stage: ConfigurationStage = ConfigurationStage.Pre) {
        let assets = this.template.configuration.assets;
        if (!!assets && assets.length > 0) {
            for (let asset of assets) {
                if (asset.stage === stage) {
                    asset = MustacheHelper.renderObject(asset, this.mustacheContext)
                    try {
                        await this.createAssetInternal(asset);
                    }
                    catch (error) {
                        telemetryHelper.logError(Layer, TracePoints.AssetCreationFailure, error);
                        throw error;
                    }
                }
            }
        }
    }

    public async getPipelineFilesToCommit(inputs: WizardInputs): Promise<string[]> {
        let workflowFile = await this.getWorkflowFile(inputs);
        this.filesToCommit.push(workflowFile);
        this.filesToCommit.forEach(async (file) => {
            await this.localGitHelper.addContentToFile(file.content, file.path);
            await vscode.window.showTextDocument(vscode.Uri.file(file.path));
        });
        return this.filesToCommit.map(x => x.path);
    }

    private async createAssetInternal(asset: Asset): Promise<void> {
        if (!!asset) {
            switch (asset.type) {
                case "AzureCredentials:SPN":
                    const subscriptionId = this.inputs.subscriptionId;
                    this.assets[asset.id] = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: utils.format(Messages.creatingAzureServiceConnection, subscriptionId)
                        },
                        async () => {
                            const inputDescriptor = this.template.parameters.inputs.find((value) => (value.type === InputDataType.Authorization && value.id === "azureAuth"));
                            const scope = InputControl.getInputDescriptorProperty(inputDescriptor, "scope", this.inputs.pipelineConfiguration.params);
                            return this.getAzureSPNSecret(this.inputs, scope);
                        });
                    break;
                case "SetGHSecret":
                    let secretKey: string = asset.inputs["secretKey"];
                    let secretValue: string = asset.inputs["secretvalue"];
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: Messages.settingUpGithubSecrets
                        },
                        async () => {
                            await this.githubClient.createOrUpdateGithubSecret(secretKey, secretValue);
                        }
                    );
                    this.secrets[asset.id] = "{{ secrets." + secretKey + " }}";
                    break;
                case "commitFile:Github":
                    let source: string = asset.inputs["source"];
                    let destination: string = asset.inputs["destination"];
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: Messages.gettingTemplateFileAsset
                        },
                        async () => {
                            destination = await this.getPathToFile(this.localGitHelper, Path.basename(destination), Path.dirname(destination));

                            let fileContent = await this.getTemplateFile(source);
                            this.filesToCommit.push({ path: destination, content: fileContent });
                        }
                    );

                    this.assets[asset.id] = destination;
                    break;
                case "LinuxWebAppNodeVersionConverter":
                    {
                        let nodeVersion: string = asset.inputs["webAppRuntimeNodeVersion"];
                        const armUri = "/providers/Microsoft.Web/availableStacks?osTypeSelected=Linux&api-version=2019-08-01";
                        this.assets[asset.id] = await nodeVersionConverter.webAppRuntimeNodeVersionConverter(nodeVersion, armUri, this.azureSession);
                    }
                    break;
                case "WindowsWebAppNodeVersionConverter":
                    {
                        let nodeVersion: string = asset.inputs["webAppRuntimeNodeVersion"];
                        const armUri = "/providers/Microsoft.Web/availableStacks?osTypeSelected=Windows&api-version=2019-08-01";
                        this.assets[asset.id] = await nodeVersionConverter.webAppRuntimeNodeVersionConverter(nodeVersion, armUri, this.azureSession);
                    }
                    break;
                case "AzureCredentials:PublishProfile":
                    {
                        let resourceId = asset.inputs["resourceId"];
                        let parsedResourceId = new ParsedAzureResourceId(resourceId);
                        let subscriptionId = parsedResourceId.subscriptionId;

                        this.assets[asset.id] = await vscode.window.withProgress(
                            {
                                location: vscode.ProgressLocation.Notification,
                                title: utils.format(Messages.creatingAzureServiceConnection, subscriptionId)
                            },
                            async () => {
                                try {
                                    // find LCS of all azure resource params
                                    let appServiceClient = new AppServiceClient(this.azureSession.credentials, this.azureSession.environment, this.azureSession.tenantId, subscriptionId);
                                    return await appServiceClient.getWebAppPublishProfileXml(resourceId);
                                }
                                catch (error) {
                                    telemetryHelper.logError(Layer, TracePoints.AzurePublishProfileCreationFailure, error);
                                    throw error;
                                }
                            });
                    }
                    break;
                default:
                    throw new Error(utils.format(Messages.assetOfTypeNotSupported, asset.type));
            }
        }
    }

    private async getWorkflowFile(inputs: WizardInputs): Promise<File> {
        let pipelineDefinition = MustacheHelper.renderObject(this.template.configuration.pipelineDefinition, this.mustacheContext);
        let workflowFileContent: string;
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: Messages.gettingWorkflowFile
            },
            async () => {
                workflowFileContent = await this.getTemplateFile(pipelineDefinition.templateFile);
            }
        );
        let workFlowFileName: string = pipelineDefinition.destinationFileName;
        workFlowFileName = await this.getPathToPipelineFile(inputs, this.localGitHelper, workFlowFileName);
        inputs.pipelineConfiguration.filePath = workFlowFileName;
        return {
            path: workFlowFileName,
            content: workflowFileContent
        }
    }

    private async getTemplateFile(fileName: string): Promise<string> {
        try {
            let result = await this.templateServiceClient.getTemplateFile(this.template.id, fileName);
            if (result.length > 0) {
                let templateFile = result.find((value) => value.id === fileName);
                if (templateFile) {
                    let content = templateConverter.convertToLocalMustacheExpression(templateFile.content);
                    return MustacheHelper.render(content, this.mustacheContext);
                }
            }
            throw new Error(utils.format(Messages.templateFileNotFound, fileName));
        } catch (error) {
            telemetryHelper.logError(Layer, TracePoints.UnableToGetTemplateFile, error);
            throw error;
        }
    }
}