import { execSync } from "node:child_process";

export function getEslintConfigContent(
	mainConfig: string,
	additionalConfigs?: Array<string>,
): string {
	return `
import isentinel from '@isentinel/eslint-config'

export default isentinel({
${mainConfig}
}${additionalConfigs?.map((config) => `,{\n${config}\n}`)})
`.trimStart();
}

export function isGitClean(): boolean {
	try {
		execSync("git diff-index --quiet HEAD --");
		return true;
	} catch {
		return false;
	}
}
