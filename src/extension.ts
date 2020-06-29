/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License.
*--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { AzureUserInput, callWithTelemetryAndErrorHandling, createTelemetryReporter, IActionContext, registerUIExtensionVariables } from 'vscode-azureextensionui';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { activateConfigurePipeline } from './configure/activate';
import { telemetryHelper } from './configure/helper/telemetryHelper';
import { extensionVariables } from './configure/model/models';
import { TelemetryKeys } from './configure/resources/telemetryKeys';
import * as logger from './logger';

export async function activate(context: vscode.ExtensionContext) {
    extensionVariables.reporter = createTelemetryReporter(context);
    registerUiVariables(context);

    await callWithTelemetryAndErrorHandling('azuredeploy.activate', async (activateContext: IActionContext) => {
        activateContext.telemetry.properties.isActivationEvent = 'true';
        telemetryHelper.initialize(activateContext, 'activate');
        await telemetryHelper.executeFunctionWithTimeTelemetry(
            async () => {
                    await activateConfigurePipeline();
            },
            TelemetryKeys.ExtensionActivationDuration);
	});
	
    // The YAML language server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('node_modules', 'yaml-language-server', 'out', 'server', 'src', 'server.js'));

	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run : { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	// Options to control the scope of language client
	let clientOptions: LanguageClientOptions = {
		documentSelector: [
			{language: "yaml", pattern: "**/.github/workflows/**", scheme: "file"},
			{language: "yaml", pattern: "**/azure-pipelines.yml", scheme: "file"}
		],
		synchronize: {
			// Synchronize these setting sections with the server
			configurationSection: ['yaml', 'http.proxy', 'http.proxyStrictSSL'],
			// Notify the server about file changes to YAML files contained in the workspace
			fileEvents: [
				vscode.workspace.createFileSystemWatcher('**/*.?(e)y?(a)ml')
			]
		}
	};

	// Create the language client and start it
	let client = new LanguageClient('yaml', 'YAML Support', serverOptions, clientOptions);
	let disposable = client.start();

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	logger.log('Extension has been activated!', 'ExtensionActivated');
}

function registerUiVariables(context: vscode.ExtensionContext) {
    // Register ui extension variables is required to be done for telemetry to start flowing for extension activation and other events.
    // It also facilitates registering command and called events telemetry.
    extensionVariables.outputChannel = vscode.window.createOutputChannel('Deploy to Azure');
    context.subscriptions.push(extensionVariables.outputChannel);
    extensionVariables.context = context;
    extensionVariables.ui = new AzureUserInput(context.globalState);
    registerUIExtensionVariables(extensionVariables);
}

// this method is called when your extension is deactivated
export function deactivate() {
}