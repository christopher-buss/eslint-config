import type { FlatGitignoreOptions } from "eslint-config-flat-gitignore";
import { findUpSync } from "find-up-simple";
import path from "node:path";
import process from "node:process";

import { interopDefault } from "../../utils.ts";
import type { TypedFlatConfigItem } from "../types.ts";

export interface GitignoreOptions {
	config?: boolean | FlatGitignoreOptions;
	explicit?: boolean;
}

export async function gitignore({
	config = true,
	explicit = false,
}: GitignoreOptions = {}): Promise<Array<TypedFlatConfigItem>> {
	if (config === false) {
		return [];
	}

	if (typeof config !== "boolean") {
		const resolved = await interopDefault(import("eslint-config-flat-gitignore"));
		const configWithName = { ...config, name: "isentinel/gitignore" };
		return [resolved(configWithName)];
	}

	const resolved = await interopDefault(import("eslint-config-flat-gitignore"));

	const foundGitignore = findUpSync(".gitignore", { cwd: process.cwd() });
	const foundGitExclude = findUpSync(".git/info/exclude", { cwd: process.cwd() });

	const result = resolved({
		name: "isentinel/gitignore",
		files: foundGitignore !== undefined ? [foundGitignore] : [],
		strict: explicit && foundGitExclude === undefined,
	});

	if (foundGitExclude !== undefined) {
		// Patterns in .git/info/exclude are relative to the repo root, but the
		// plugin resolves them against the ignore file's own directory. Setting
		// cwd to that directory keeps the patterns unprefixed so ESLint applies
		// them relative to the config root instead.
		const exclude = resolved({
			cwd: path.dirname(foundGitExclude),
			files: [foundGitExclude],
			filesGitModules: [],
			strict: false,
		});
		result.ignores = [...result.ignores, ...exclude.ignores];
	}

	return [result];
}
