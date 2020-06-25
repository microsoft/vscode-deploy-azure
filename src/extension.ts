/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License.
*--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { AzureUserInput, callWithTelemetryAndErrorHandling, createTelemetryReporter, IActionContext, registerUIExtensionVariables } from 'vscode-azureextensionui';
import { LanguageClient, LanguageClientOptions, NotificationType, ServerOptions, TransportKind } from 'vscode-languageclient';
import { activateConfigurePipeline } from './configure/activate';
import { telemetryHelper } from './configure/helper/telemetryHelper';
import { extensionVariables } from './configure/model/models';
import { TelemetryKeys } from './configure/resources/telemetryKeys';
import * as logger from './logger';
import { SchemaExtensionAPI } from './schema-extension-api';

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

    logger.log('Extension has been activated!', 'ExtensionActivated');

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

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for on disk and newly created YAML documents
		documentSelector: [
			{language: "yaml", pattern: "**/.github/workflows/**", scheme: "file"}
			
            
			//		{language: "yaml", pattern: "**/AppFolder/**", scheme: "file"},
		],
		synchronize: {
			// Synchronize these setting sections with the server
			configurationSection: ['yaml', 'http.proxy', 'http.proxyStrictSSL'],
			// Notify the server about file changes to YAML and JSON files contained in the workspace
			fileEvents: [
				vscode.workspace.createFileSystemWatcher('**/*.?(e)y?(a)ml'),
				vscode.workspace.createFileSystemWatcher('**/*.json')
			]
		}
	};

	// Create the language client and start it
	let client = new LanguageClient('yaml', 'YAML Support', serverOptions, clientOptions);
	let disposable = client.start();

	const schemaExtensionAPI = new SchemaExtensionAPI(client);

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	client.onReady().then(() => {
		// Send a notification to the server with any YAML schema associations in all extensions
		client.sendNotification(SchemaAssociationNotification.type, getSchemaAssociation(context));

		// If the extensions change, fire this notification again to pick up on any association changes
		vscode.extensions.onDidChange(_ => {
			client.sendNotification(SchemaAssociationNotification.type, getSchemaAssociation(context));
        });
        

        //no need for custom schema
        /*
		// Tell the server that the client is ready to provide custom schema content
		client.sendNotification(DynamicCustomSchemaRequestRegistration.type);
        // If the server asks for custom schema content, get it and send it back
		client.onRequest(CUSTOM_SCHEMA_REQUEST, (resource: string) => {
			return schemaExtensionAPI.requestCustomSchema(resource);
		});
		client.onRequest(CUSTOM_CONTENT_REQUEST, (uri: string) => {
			return schemaExtensionAPI.requestCustomSchemaContent(uri);
		});*/
	});

	return schemaExtensionAPI;
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

export interface ISchemaAssociations {
	[pattern: string]: string[];
}

namespace SchemaAssociationNotification {
	export const type: NotificationType<ISchemaAssociations, any> = new NotificationType('json/schemaAssociations');
}

/* no custom schema required
namespace DynamicCustomSchemaRequestRegistration {
	export const type: NotificationType<{}, {}> = new NotificationType('yaml/registerCustomSchemaRequest');
}*/

function getSchemaAssociation(context: vscode.ExtensionContext): ISchemaAssociations {
    let associations: ISchemaAssociations = {};
    /* 
	// Scan all extensions
    vscode.extensions.all.forEach(extension => {
        let packageJSON = extension.packageJSON;
        
        //This section is probably for custom validation

		// Look for yamlValidation contribution point in the package.json
		if (packageJSON && packageJSON.contributes && packageJSON.contributes.yamlValidation) {
			let yamlValidation = packageJSON.contributes.yamlValidation;
			// If the extension provides YAML validation
			if (Array.isArray(yamlValidation)) {
				yamlValidation.forEach(jv => {
					// Get the extension's YAML schema associations
					let { fileMatch, url } = jv;

					if (fileMatch && url) {
						// Convert relative file paths to absolute file URIs
						if (url[0] === '.' && url[1] === '/') {
							url = URI.file(path.join(extension.extensionPath, url)).toString();
						}
						// Replace path variables
						if (fileMatch[0] === '%') {
							fileMatch = fileMatch.replace(/%APP_SETTINGS_HOME%/, '/User');
							fileMatch = fileMatch.replace(/%APP_WORKSPACES_HOME%/, '/Workspaces');
						} else if (fileMatch.charAt(0) !== '/' && !fileMatch.match(/\w+:\/\//)) {
							fileMatch = '/' + fileMatch;
						}
						// Create a file-schema association
						let association = associations[fileMatch];

						if (!association) {
							association = [];
							associations[fileMatch] = association;
						}
						// Store the file-schema association
						association.push(url);
					}
				});
			}
		}
    });
    */

	return associations;
}