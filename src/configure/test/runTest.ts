import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as git from 'simple-git/promise';
import { runTests } from 'vscode-test';

async function testHost() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		validateEnvironmentVariables();
		const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

		const extensionTestsEnv = {
			"DEBUGTELEMETRY": "v"
		}

		let sampleRepoFolder: string;

		// The path to test runner
		// Passed to --extensionTestsPath
		let extensionTestsPath: string;

		console.log("### Running Unit Tests ###")
		extensionTestsPath = path.resolve(__dirname, './UnitTestsSuite');
		await runTests({ launchArgs: [], extensionDevelopmentPath, extensionTestsPath, extensionTestsEnv });

		console.log("### Running Static Website on Windows WebApp Test ####")
		extensionTestsPath = path.resolve(__dirname, './E2ETests/Static_Win_WebApp_Suite');
		sampleRepoFolder = await setupGitHubRepoFolderForStaticWebApp();
		await runTests({ launchArgs: [sampleRepoFolder], extensionDevelopmentPath, extensionTestsPath, extensionTestsEnv });

	} catch (err) {
		console.error('Failed to run tests. Error : ' + err);
		process.exit(1);
	}
}

async function setupGitHubRepoFolderForStaticWebApp(): Promise<string> {
	const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'staticwebapp-'));
	console.log("## Static WebApp ProjectPath: " + projectPath);
	const gitUrl = "https://github.com/vineetmimrot/StaticWebapp.git";
	await git(projectPath).clone(gitUrl, projectPath);
	return projectPath;
}

function validateEnvironmentVariables() {
	let unsetVariables: string = "";
	if (!process.env.Azure_UserName) {
		unsetVariables += "Azure_UserName, "
	}

	if (!process.env.Azure_PAT) {
		unsetVariables += "Azure_PAT, "
	}

	if (!process.env.GITHUB_TOKEN) {
		unsetVariables += "GITHUB_TOKEN"
	}
	if (unsetVariables != "") {
		throw new Error(`Env variable ${unsetVariables} are not set`);
	}
}

testHost();