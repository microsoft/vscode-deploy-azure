import * as vscode from 'vscode';
import { AzureTreeItem, UserCancelledError } from 'vscode-azureextensionui';

import { AppServiceClient, ScmType } from './clients/azure/appServiceClient';
import { getSubscriptionSession } from './helper/azureSessionHelper';
import { ControlProvider } from './helper/controlProvider';
import { AzureSession, ParsedAzureResourceId, extensionVariables } from './model/models';
import * as constants from './resources/constants';
import { Messages } from './resources/messages';
import { telemetryHelper, Result } from './helper/telemetryHelper';
import { TelemetryKeys } from './resources/telemetryKeys';

export async function browsePipeline(node: AzureTreeItem): Promise<void> {
    await telemetryHelper.executeFunctionWithTimeTelemetry(async () => {
        try {
            if (!!node && !!node.fullId) {
                let parsedAzureResourceId: ParsedAzureResourceId = new ParsedAzureResourceId(node.fullId);
                let session: AzureSession = getSubscriptionSession(parsedAzureResourceId.subscriptionId);
                let appServiceClient = new AppServiceClient(session.credentials, session.environment, session.tenantId, parsedAzureResourceId.subscriptionId);
                let siteConfig = await appServiceClient.getAppServiceConfig(node.fullId);
                telemetryHelper.setTelemetry(TelemetryKeys.ScmType, siteConfig.scmType);
                let controlProvider = new ControlProvider();

                if (siteConfig.scmType.toLowerCase() === ScmType.VSTSRM.toLowerCase()) {
                    let pipelineUrl = await appServiceClient.getAzurePipelineUrl(node.fullId);
                    vscode.env.openExternal(vscode.Uri.parse(pipelineUrl));
                    telemetryHelper.setTelemetry(TelemetryKeys.BrowsedExistingPipeline, 'true');
                }
                else if(siteConfig.scmType.toLowerCase() === ScmType.GITHUBACTION.toLowerCase()) {
                    await browseGitHubWorkflow(node.fullId, appServiceClient);
                }
                else if (siteConfig.scmType === '' || siteConfig.scmType.toLowerCase() === ScmType.NONE.toLowerCase()) {
                    let deployToAzureAction = 'Deploy to Azure';
                    let result = await controlProvider.showInformationBox(
                        constants.BrowseNotAvailableConfigurePipeline,
                        Messages.browseNotAvailableConfigurePipeline,
                        deployToAzureAction);

                    if (result === deployToAzureAction) {
                        vscode.commands.executeCommand('configure-cicd-pipeline', node);
                        telemetryHelper.setTelemetry(TelemetryKeys.ClickedConfigurePipeline, 'true');
                    }
                }
                else {
                    await openDeploymentCenter(node.fullId, appServiceClient);
                }
            }
            else {
                throw new Error(Messages.didNotRecieveAzureResourceNodeToProcess);
            }
        }
        catch (error) {
            if (!(error instanceof UserCancelledError)) {
                extensionVariables.outputChannel.appendLine(error.message);
                vscode.window.showErrorMessage(error.message);
                telemetryHelper.setResult(Result.Failed, error);
            }
            else {
                telemetryHelper.setResult(Result.Canceled, error);
            }
        }
    }, TelemetryKeys.CommandExecutionDuration);
}

async function browseGitHubWorkflow(resourceId: string, appServiceClient: AppServiceClient): Promise<void> {
    let webAppSourceControl = await appServiceClient.getSourceControl(resourceId);

    if (!!webAppSourceControl && !!webAppSourceControl.properties && webAppSourceControl.properties.isGitHubAction) {
        let url = `${webAppSourceControl.properties.repoUrl}/actions?query=branch=${webAppSourceControl.properties.branch}`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
        telemetryHelper.setTelemetry(TelemetryKeys.BrowsedDeploymentCenter, 'true');
    }
    else {
        await openDeploymentCenter(resourceId, appServiceClient);
    }
}

async function openDeploymentCenter(resourceId: string, appServiceClient: AppServiceClient): Promise<void> {
    let deploymentCenterUrl: string = await appServiceClient.getDeploymentCenterUrl(resourceId);
    await vscode.env.openExternal(vscode.Uri.parse(deploymentCenterUrl));
    telemetryHelper.setTelemetry(TelemetryKeys.BrowsedDeploymentCenter, 'true');
}