/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { createTelemetryReporter, callWithTelemetryAndErrorHandling, IActionContext, AzureUserInput, registerUIExtensionVariables } from 'vscode-azureextensionui';

import { activateConfigurePipeline } from './configure/activate';
import { extensionVariables } from './configure/model/models';
import * as logger from './logger';
import { telemetryHelper } from './configure/helper/telemetryHelper';
import { TelemetryKeys } from './configure/resources/telemetryKeys';

export async function activate(context: vscode.ExtensionContext) {
    extensionVariables.reporter = createTelemetryReporter(context);
    registerUiVariables(context);

    await callWithTelemetryAndErrorHandling('azurePipelines.activate', async (activateContext: IActionContext) => {
        activateContext.telemetry.properties.isActivationEvent = 'true';
        telemetryHelper.initialize(activateContext, 'activate');
        await telemetryHelper.executeFunctionWithTimeTelemetry(
            async () => {
                    await activateConfigurePipeline();
            },
            TelemetryKeys.ExtensionActivationDuration);
    });

    logger.log('Extension has been activated!', 'ExtensionActivated');
}

function registerUiVariables(context: vscode.ExtensionContext) {
    // Register ui extension variables is required to be done for telemetry to start flowing for extension activation and other events.
    // It also facilitates registering command and called events telemetry.
    extensionVariables.outputChannel = vscode.window.createOutputChannel('Azure Pipelines');
    context.subscriptions.push(extensionVariables.outputChannel);
    extensionVariables.context = context;
    extensionVariables.ui = new AzureUserInput(context.globalState);
    registerUIExtensionVariables(extensionVariables);
}

// this method is called when your extension is deactivated
export function deactivate() {
}