import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as git from 'simple-git/promise';
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from 'vscode-test';

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

		const vscodeExecutablePath = await downloadAndUnzipVSCode();
		const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);
		cp.spawnSync(cliPath, ['--install-extension', 'ms-vscode.azure-account'], {
			encoding: 'utf-8',
			stdio: 'inherit'
		});


		console.log("### Running Unit Tests ###")
		extensionTestsPath = path.resolve(__dirname, './UnitTestsSuite');
		await runTests({ launchArgs: [], extensionDevelopmentPath, extensionTestsPath, extensionTestsEnv });

		console.log("### Running Static Website on Windows WebApp Test ####")
		extensionTestsPath = path.resolve(__dirname, './E2ETests/Static_Win_WebApp_Suite');
		sampleRepoFolder = await setupGitHubRepoFolderForStaticWebApp();
		await runTests({ launchArgs: [sampleRepoFolder], extensionDevelopmentPath, extensionTestsPath, extensionTestsEnv });
		printTestResultFiles();
	} catch (err) {
		console.error('Failed to run tests. Error : ' + err);
		printTestResultFiles();
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

function printTestResultFiles() {
	const testsRoot = path.resolve(__dirname);
	const testResultDir = path.join(testsRoot, 'deploy-azure-extension-testResult');
	if (!fs.existsSync(testResultDir)) {
		return;
	}

	let filenames = fs.readdirSync(testResultDir);

	console.log("\n### Test Report ###");
	let count = 1;
	filenames.forEach((file) => {
		console.log("### " + count++ + ". Test Suite: " + path.parse(file).name + " ###");
		console.log("\n" + fs.readFileSync(path.resolve(testResultDir, file), 'utf-8'));
		console.log("\n");
	});
}

testHost();