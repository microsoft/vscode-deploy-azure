import * as Path from 'path';
import * as utils from 'util';
import * as vscode from 'vscode';
import { AzureResourceClient } from "../clients/azure/azureResourceClient";
import { GithubClient } from '../clients/github/githubClient';
import { TemplateServiceClient } from '../clients/github/TemplateServiceClient';
import { LocalGitRepoHelper } from '../helper/LocalGitRepoHelper';
import { MustacheHelper } from '../helper/mustacheHelper';
import { telemetryHelper } from '../helper/telemetryHelper';
import { Asset, ConfigurationStage, ExtendedInputDescriptor, InputDataType } from "../model/Contracts";
import { AzureSession, StringMap, WizardInputs } from "../model/models";
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
    private secrets: { [key: string]: any } = {};
    private variables: { [key: string]: any } = {};
    private system: { [key: string]: any } = {};
    private filesToCommit: File[] = [];
    private mustacheContext: StringMap<any>;
    private template: RemotePipelineTemplate;
    private localGitHelper: LocalGitRepoHelper;
    private templateServiceClient: TemplateServiceClient;

    constructor(azureSession: AzureSession, subscriptionId: string, localGitHelper: LocalGitRepoHelper) {
        super(azureSession, subscriptionId);
        this.azureSession = azureSession;
        this.localGitHelper = localGitHelper;
    }

    public async getInputs(inputs: WizardInputs): Promise<void> {
        this.githubClient = new GithubClient(inputs.githubPATToken, inputs.sourceRepository.remoteUrl);
        this.templateServiceClient = new TemplateServiceClient(inputs.azureSession.credentials);
        this.template = inputs.pipelineConfiguration.template as RemotePipelineTemplate;
        let extendedPipelineTemplate = await new TemplateServiceClient(this.azureSession.credentials).getTemplateConfiguration(this.template.id, inputs.pipelineConfiguration.params);
        extendedPipelineTemplate = templateConverter.convertToLocalMustacheExpression(extendedPipelineTemplate);

        this.template.variables = extendedPipelineTemplate.variables;
        this.template.pipelineDefinition = extendedPipelineTemplate.pipelineDefinition;
        this.template.assets = extendedPipelineTemplate.assets;

        this.template.assets.forEach((asset: Asset) => {
            if (!asset.stage) {
                asset.stage = ConfigurationStage.Pre;
            }
        });

        this.system["sourceRepository"] = inputs.sourceRepository;

        this.mustacheContext = {
            inputs: inputs.pipelineConfiguration.params,
            variables: this.variables,
            assets: this.assets,
            secrets: this.secrets,
            system: this.system
        }

        for (let variable of this.template.variables) {
            let expression = variable.value;
            let value = MustacheHelper.render(expression, this.mustacheContext);
            this.variables[variable.id] = value;
        }
    }

    public async createPreRequisites(inputs: WizardInputs, azureResourceClient: AzureResourceClient) {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: utils.format(Messages.creatingAzureServiceConnection, inputs.subscriptionId)
            },
            async () => {
                for (var input of this.template.inputs) {
                    if (input.type === InputDataType.Authorization && input.id !== "azureDevOpsAuth") {
                        inputs.pipelineConfiguration.params[input.id] = await this.createAzureSPN(input, inputs);
                    }
                }
            });
    }

    public async createAssets(stage: ConfigurationStage = ConfigurationStage.Pre) {
        let assets = this.template.assets;
        if (!!assets && assets.length > 0) {
            for (let asset of assets) {
                if (asset.stage === stage) {
                    asset = MustacheHelper.renderObject(asset, this.mustacheContext)
                    try {
                        await this.createAssetInternal(asset);
                    }
                    catch (error) {
                        telemetryHelper.logError(Layer, TracePoints.AssetCreationFailure, error)
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
                case "AzureCredentials":
                    let azureCreds = asset.inputs["azureAuth"];
                    this.assets[asset.id] = azureCreds;
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
                    this.secrets[asset.id] = secretKey;
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
                default:
                    throw new Error(utils.format(Messages.assetOfTypeNotSupported, asset.type));
            }
        }
    }

    private async getWorkflowFile(inputs: WizardInputs): Promise<File> {
        let pipelineDefinition = MustacheHelper.renderObject(this.template.pipelineDefinition, this.mustacheContext);
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
        inputs.pipelineConfiguration.filePath = workFlowFileName
        return {
            path: workFlowFileName,
            content: workflowFileContent
        }
    }

    private async createAzureSPN(inputDescriptor: ExtendedInputDescriptor, inputs: WizardInputs) {
        let scope = InputControl.getInputDescriptorProperty(inputDescriptor, "scope", inputs.pipelineConfiguration.params)
        return this.getAzureSPNSecret(inputs, scope);

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
            telemetryHelper.logError(Layer, TracePoints.GetTemplateFile, error);
            throw error;
        }
    }
}