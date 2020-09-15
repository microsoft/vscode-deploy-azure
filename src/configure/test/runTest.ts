import * as path from 'path';
import { runTests } from 'vscode-test';


async function testHost() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './index');

		// Download VS Code, unzip it and run the integration test
		await runTests({ launchArgs: ["/Users/vineetmimrot/work/raw-work/repo/github/staticwebapp"], extensionDevelopmentPath, extensionTestsPath });
	} catch (err) {
		console.error('Failed to run tests. Error : ' + err);
		process.exit(1);
	}
}

testHost();
