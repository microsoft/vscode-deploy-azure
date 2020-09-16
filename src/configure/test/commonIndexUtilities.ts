import * as fs from 'fs';
import * as glob from 'glob';
import * as Mocha from 'mocha';
import * as path from 'path';

export function setupTest(suiteName: string, suitePath: string): Promise<void> {
	const testsRoot = path.resolve(__dirname, '..');
	const testResultDir = path.join(testsRoot, 'test', 'deploy-azure-extension-testResult');
	if (!fs.existsSync(testResultDir)) {
		fs.mkdirSync(testResultDir);
	}
	const testResultFileName = path.normalize(path.join(testResultDir, suiteName + "-" + ((new Date()).toJSON().slice(0, 19).replace('T', '_').replace(/:/g, '')) + ".xml"));
	const mocha = new Mocha({
		ui: 'bdd',
		color: true,
		reporter: "xunit",
		reporterOptions: {
			output: testResultFileName,
		}
	});

	return new Promise((c, e) => {
		glob(suitePath + '/**.test.js', { cwd: testsRoot }, (err, files) => {
			if (err) {
				return e(err);
			}

			// Add files to the test suite
			files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

			try {
				// Run the mocha test
				mocha.run(failures => {
					if (failures > 0) {
						e(new Error(`${failures} tests failed.`));
					} else {
						c();
					}
				});
			} catch (err) {
				console.error(err);
				e(err);
			}
		});
	});
}