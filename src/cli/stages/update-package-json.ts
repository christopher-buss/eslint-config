import { confirm, log, note } from "@clack/prompts";

import ansis from "ansis";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { PackageJson } from "type-fest";

import ownPackageJson from "../../../package.json" with { type: "json" };
import { versionsMap } from "../constants-generated.ts";
import { dependenciesMap } from "../constants.ts";
import type { PromptResult } from "../types.ts";

/** Scripts the wizard wires up so `pnpm lint` drives the hybrid runner. */
export const LINT_SCRIPTS: Record<string, string> = {
	"lint": "isentinel-lint",
	"lint:fix": "isentinel-lint --fix",
};

/** Whether an existing script should be overwritten by the new value. */
export type ConfirmOverwrite = (
	name: string,
	existing: string,
	desired: string,
) => Promise<boolean>;

/** Outcome of merging {@link LINT_SCRIPTS} into a scripts block. */
export interface ScriptMergeResult {
	/** Names of scripts newly added because none existed. */
	added: Array<string>;
	/** Names of scripts overwritten after the user confirmed. */
	overwritten: Array<string>;
}

/**
 * Merge the lint scripts into a `scripts` block in place. Missing scripts are
 * always added. An existing script with identical content is left untouched. An
 * existing script with different content is preserved in skip-prompt mode, and
 * otherwise only overwritten when {@link ConfirmOverwrite} resolves true.
 *
 * @param scripts - The consumer's `scripts` block, mutated in place.
 * @param options - Skip-prompt flag and the overwrite confirmation callback.
 * @returns Which scripts were added and which were overwritten.
 */
export async function mergeLintScripts(
	scripts: Partial<Record<string, string>>,
	options: { confirmOverwrite?: ConfirmOverwrite; skipPrompt: boolean },
): Promise<ScriptMergeResult> {
	const added: Array<string> = [];
	const overwritten: Array<string> = [];

	for (const [name, desired] of Object.entries(LINT_SCRIPTS)) {
		const existing = scripts[name];
		if (existing === undefined) {
			scripts[name] = desired;
			added.push(name);
			continue;
		}

		if (existing === desired || options.skipPrompt) {
			continue;
		}

		const shouldOverwrite = await options.confirmOverwrite?.(name, existing, desired);
		if (shouldOverwrite === true) {
			scripts[name] = desired;
			overwritten.push(name);
		}
	}

	return { added, overwritten };
}

export async function updatePackageJson(result: PromptResult, skipPrompt = false): Promise<void> {
	const cwd = process.cwd();

	const pathPackageJSON = path.join(cwd, "package.json");

	log.step(ansis.cyan(`Bumping @isentinel/eslint-config to v${ownPackageJson.version}`));

	const packageContent = await fsp.readFile(pathPackageJSON, "utf-8");
	const parsedPackage: PackageJson = JSON.parse(packageContent);

	parsedPackage.devDependencies ??= {};
	parsedPackage.devDependencies["@isentinel/eslint-config"] = `^${ownPackageJson.version}`;
	parsedPackage.devDependencies["eslint"] ??= versionsMap.eslint;

	const addedPackages: Array<string> = [];

	for (const framework of result.frameworks) {
		if (!(framework in dependenciesMap)) {
			continue;
		}

		const dependencies = dependenciesMap[framework];
		for (const dependency of dependencies) {
			parsedPackage.devDependencies[dependency] =
				versionsMap[dependency as keyof typeof versionsMap];
			addedPackages.push(dependency);
		}
	}

	if (addedPackages.length) {
		note(ansis.dim(addedPackages.join(", ")), "Added packages");
	}

	parsedPackage.scripts ??= {};
	const { scripts = {} } = parsedPackage;
	const { added, overwritten } = await mergeLintScripts(scripts, {
		confirmOverwrite: async (name, existing, desired) => {
			const answer = await confirm({
				initialValue: false,
				message: `A "${name}" script already exists ("${existing}"). Overwrite it with "${desired}"?`,
			});
			return answer === true;
		},
		skipPrompt,
	});

	const touched = [...added, ...overwritten];
	if (touched.length) {
		note(
			ansis.dim(touched.map((name) => `${name}: ${scripts[name]}`).join("\n")),
			"Lint scripts",
		);
	}

	await fsp.writeFile(pathPackageJSON, JSON.stringify(parsedPackage, null, 2));
	log.success(ansis.green("Changes wrote to package.json"));
}
