import * as vscode from 'vscode';
import { AzureTreeItem, UserCancelledError } from 'vscode-azureextensionui';

import { AppServiceClient, ScmType } from './clients/azure/appServiceClient';
import { getSubscriptionSession } from './helper/azureSessionHelper';
import { AzureSession, ParsedAzureResourceId, extensionVariables } from './model/models';
import { Messages } from './resources/messages';
import { telemetryHelper, Result } from './helper/telemetryHelper';
import { TelemetryKeys } from './resources/telemetryKeys';
import { TracePoints } from './resources/tracePoints';

const Layer = 'browsePipeline';

export async function browsePipeline(node: AzureTreeItem): Promise<void> {
    await telemetryHelper.executeFunctionWithTimeTelemetry(async () => {
        try {
            if (!!node && !!node.fullId) {
                let parsedAzureResourceId: ParsedAzureResourceId = new ParsedAzureResourceId(node.fullId);
                let session: AzureSession = getSubscriptionSession(parsedAzureResourceId.subscriptionId);
                let appServiceClient = new AppServiceClient(session.credentials, session.tenantId, session.environment.portalUrl, parsedAzureResourceId.subscriptionId);
                await browsePipelineInternal(node.fullId, appServiceClient);
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

export async function browsePipelineInternal(resourceId: string, appServiceClient: AppServiceClient): Promise<void> {
    let siteConfig = await appServiceClient.getAppServiceConfig(resourceId);
    telemetryHelper.setTelemetry(TelemetryKeys.ScmType, siteConfig.scmType);

    if (siteConfig.scmType.toLowerCase() === ScmType.VSTSRM.toLowerCase()) {
        try {
            let pipelineUrl = await appServiceClient.getAzurePipelineUrl(resourceId);
            vscode.env.openExternal(vscode.Uri.parse(pipelineUrl));
            telemetryHelper.setTelemetry(TelemetryKeys.BrowsedExistingPipeline, 'true');
            return;
        }
        catch (ex) {
            telemetryHelper.logError(Layer, TracePoints.CorruptMetadataForVstsRmScmType, ex);
        }
    }

    let deploymentCenterUrl: string = await appServiceClient.getDeploymentCenterUrl(resourceId);
    await vscode.env.openExternal(vscode.Uri.parse(deploymentCenterUrl));
    telemetryHelper.setTelemetry(TelemetryKeys.BrowsedDeploymentCenter, 'true');
}
