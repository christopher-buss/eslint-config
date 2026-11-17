import type { FlatGitignoreOptions } from "eslint-config-flat-gitignore";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { findGitExclude } from "../../git-exclude.ts";
import { interopDefault } from "../../utils.ts";
import type { TypedFlatConfigItem } from "../types.ts";

export interface GitignoreOptions {
	config?: boolean | FlatGitignoreOptions;
	explicit?: boolean;
}

type FlatGitignore = typeof import("eslint-config-flat-gitignore").default;

export async function gitignore({
	config = true,
	explicit = false,
}: GitignoreOptions = {}): Promise<Array<TypedFlatConfigItem>> {
	if (config === false) {
		return [];
	}

	const resolved = await interopDefault(import("eslint-config-flat-gitignore"));

	// Without `files`, the plugin finds the closest `.gitignore` and also
	// reads `.git/info/exclude`, with its patterns as repo-root ignores.
	const options: FlatGitignoreOptions =
		typeof config === "boolean"
			? { name: "isentinel/gitignore", strict: explicit }
			: { ...config, name: "isentinel/gitignore" };

	const item = resolved(options);
	if ("files" in options || options.root === true) {
		return [item];
	}

	const excludes = linkedExcludePatterns(resolved, options.cwd ?? process.cwd());
	return [{ ...item, ignores: [...excludes, ...item.ignores] }];
}

/**
 * The plugin reads `info/exclude` from `<closest .git>/info/exclude`. In a
 * linked worktree `.git` is a file, so that path never exists and the shared
 * exclude file is skipped. Read it here instead.
 *
 * @param resolved - The plugin, reused to parse the file.
 * @param cwd - Directory to search from.
 * @returns Exclude patterns the plugin did not read itself.
 */
function linkedExcludePatterns(resolved: FlatGitignore, cwd: string): Array<string> {
	const exclude = findGitExclude(cwd);
	if (exclude?.linked !== true || !existsSync(exclude.file)) {
		return [];
	}

	// With `cwd` set to the file's own folder, patterns stay root-relative.
	return resolved({
		cwd: path.dirname(exclude.file),
		files: exclude.file,
		filesGitModules: [],
		strict: false,
	}).ignores;
}
