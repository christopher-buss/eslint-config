import { cancel, confirm, group, log, multiselect, outro } from "@clack/prompts";

import ansis from "ansis";
import fs from "node:fs";
import process from "node:process";

import { frameworkOptions, frameworks } from "./constants";
import { updateEslintFiles } from "./stages/update-eslint-files";
import { updatePackageJson } from "./stages/update-package-json";
import { updateVscodeSettings } from "./stages/update-vscode-settings";
import type { FrameworkOption, PromptResult } from "./types";
import { isGitClean } from "./utils";

export interface CliRunOptions {
	/** Use the framework template for optimal customization: react. */
	frameworks?: Array<string>;
	/** Skip prompts and use default values. */
	yes?: boolean;
}

export async function run(options: CliRunOptions = {}): Promise<undefined> {
	const argumentSkipPrompt = !!(process.env.SKIP_PROMPT ?? "") || options.yes;
	const argumentTemplate = options.frameworks
		?.map((framework) => framework.trim())
		.filter((framework): framework is FrameworkOption => {
			return frameworks.includes(framework as FrameworkOption);
		});

	const eslintConfigFiles = fs
		.readdirSync(process.cwd())
		.filter((file) => file.startsWith("eslint.config."));

	if (eslintConfigFiles.length > 0) {
		log.warn(ansis.yellow(`${eslintConfigFiles[0]} already exists, migration wizard exited.`));
		return process.exit(1);
	}

	// Set default value for promptResult if `argSkipPrompt` is enabled
	let result: PromptResult = {
		frameworks: argumentTemplate ?? [],
		uncommittedConfirmed: false,
		updateVscodeSettings: true,
	};

	if (argumentSkipPrompt !== true) {
		result = (await group(
			{
				uncommittedConfirmed: async () => {
					if (isGitClean()) {
						return true;
					}

					return confirm({
						initialValue: false,
						message:
							"There are uncommitted changes in the current repository, are you sure to continue?",
					});
				},

				// eslint-disable-next-line perfectionist/sort-objects -- keep the order of prompts
				frameworks: async ({ results }) => {
					const isArgumentTemplateValid =
						argumentTemplate &&
						argumentTemplate.length > 0 &&
						argumentTemplate.every((template) => frameworks.includes(template));

					if (results.uncommittedConfirmed !== true || isArgumentTemplateValid === true) {
						return;
					}

					const message =
						argumentTemplate && argumentTemplate.length > 0
							? `"${argumentTemplate.join(", ")}" isn't a valid template. Please choose from below: `
							: "Select a framework:";

					return multiselect<FrameworkOption>({
						message: ansis.reset(message),
						options: frameworkOptions,
						required: false,
					});
				},

				updateVscodeSettings: async ({ results }) => {
					if (results.uncommittedConfirmed !== true) {
						return;
					}

					return confirm({
						initialValue: true,
						message: "Update .vscode/settings.json for better VS Code experience?",
					});
				},
			},
			{
				onCancel: () => {
					cancel("Operation cancelled.");
					process.exit(0);
				},
			},
		)) as PromptResult;

		if (!result.uncommittedConfirmed) {
			return process.exit(1);
		}
	}

	await updatePackageJson(result);
	await updateEslintFiles(result);
	await updateVscodeSettings(result);

	log.success(ansis.green("Setup completed"));
	outro(
		`Now you can update the dependencies by running ${ansis.blue("pnpm install")} and run ${ansis.blue("eslint --fix")}\n`,
	);
}
