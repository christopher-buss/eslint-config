import type { FlatGitignoreOptions } from "eslint-config-flat-gitignore";
import { findUpSync } from "find-up-simple";
import process from "node:process";

import type { TypedFlatConfigItem } from "../types";
import { interopDefault } from "../utils";

export interface GitignoreOptions {
	config?: boolean | FlatGitignoreOptions;
	explicit?: boolean;
}

export async function gitignore(
	options: GitignoreOptions = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { config = true, explicit = false } = options;

	if (config === false) {
		return [];
	}

	if (typeof config !== "boolean") {
		const resolved = await interopDefault(import("eslint-config-flat-gitignore"));
		const configWithName = Object.assign({}, config, { name: "isentinel/gitignore" });
		return [resolved(configWithName)];
	}

	const resolved = await interopDefault(import("eslint-config-flat-gitignore"));

	const foundGitignore = findUpSync(".gitignore", { cwd: process.cwd() });
	const foundGitExclude = findUpSync(".git/info/exclude", { cwd: process.cwd() });

	const files = [];
	if (foundGitignore !== undefined) {
		files.push(foundGitignore);
	}

	if (foundGitExclude !== undefined) {
		files.push(foundGitExclude);
	}

	return [
		resolved({
			name: "isentinel/gitignore",
			files,
			strict: explicit,
		}),
	];
}
