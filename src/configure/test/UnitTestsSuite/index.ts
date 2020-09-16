import * as path from 'path';
import { setupTest } from "../commonIndexUtilities";

export function run(): Promise<void> {
	return setupTest(path.basename(__dirname), __dirname);
}