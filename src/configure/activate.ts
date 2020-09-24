import * as vscode from 'vscode';
import { AzureTreeItem, createApiProvider, IActionContext, registerCommand } from 'vscode-azureextensionui';
import { AzureExtensionApi, AzureExtensionApiProvider } from 'vscode-azureextensionui/api';
import { browsePipeline } from './browse';
import { configurePipeline } from './configure';
import { telemetryHelper } from './helper/telemetryHelper';
import { AzureAccountExtensionExports, extensionVariables } from './model/models';
import { Messages } from './resources/messages';

export async function activateConfigurePipeline(): Promise<AzureExtensionApiProvider> {
    let azureAccountExtension = vscode.extensions.getExtension("ms-vscode.azure-account");
    if (!azureAccountExtension) {
        throw new Error(Messages.azureAccountExntesionUnavailable);
    }

    if (!azureAccountExtension.isActive) {
        await azureAccountExtension.activate();
    }

    extensionVariables.azureAccountExtensionApi = <AzureAccountExtensionExports>azureAccountExtension.exports;

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    registerCommand('configure-cicd-pipeline', async (actionContext: IActionContext, node: any) => {
        // The code you place here will be executed every time your command is executed
        telemetryHelper.initialize(actionContext, 'configure-cicd-pipeline');
        await configurePipeline(node);
    });

    registerCommand('browse-cicd-pipeline', async (actionContext: IActionContext, node: AzureTreeItem) => {
        // The code you place here will be executed every time your command is executed
        telemetryHelper.initialize(actionContext, 'browse-cicd-pipeline');
        await browsePipeline(node);
    });

    return createApiProvider([<AzureExtensionApi>
        {
            configurePipelineApi: configurePipeline,
            browsePipeline: browsePipeline,
            apiVersion: "0.0.1"
        }]);
}
