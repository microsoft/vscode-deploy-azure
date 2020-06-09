import { JSONPath } from 'jsonpath-plus';
import * as vscode from 'vscode';
import { ArmRestClient } from '../clients/azure/armRestClient';
import { AzureSession } from "../model/models";
import { Messages } from '../resources/messages';

export async function webAppRuntimeNodeVersionConverter(nodeVersion: string, armUri: string, azureSession: AzureSession): Promise<string> {
    if (nodeVersion.indexOf('|') >= 0) {
        nodeVersion = nodeVersion.split('|')[1];
    } else {
        nodeVersion = 'lts';
    }
    if (nodeVersion.toLowerCase() === 'lts') {
        let versions: string[];
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: Messages.GettingNodeVersion
            },
            async () => {
                const resultSelector = "$.value[?(@.name === 'node')].properties.majorVersions[*].runtimeVersion";
                const response = await new ArmRestClient(azureSession).fetchArmData(armUri, 'GET');
                versions = JSONPath({ path: resultSelector, json: response, wrap: false, flatten: true });
            }
        );
        let maxVersion = 0;
        versions.forEach((version: string) => {
            const match = version.match(/(\d+)-lts/i);
            if (match && match.length > 1) {
                maxVersion = Math.max(maxVersion, +match[1]);
            }
        });
        nodeVersion = maxVersion + '.x';
    } else if (nodeVersion.match(/(\d+)-lts/i)) {
        nodeVersion = nodeVersion.replace(/-lts/i, '.x');
    }
    return nodeVersion;
}