import type { FlatGitignoreOptions } from "eslint-config-flat-gitignore";

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

	const resolved = await interopDefault(import("eslint-config-flat-gitignore"));

	if (typeof config !== "boolean") {
		return [resolved({ ...config, name: "isentinel/gitignore" })];
	}

	// Without `files`, the plugin finds the closest `.gitignore` and also
	// reads `.git/info/exclude`, with its patterns as repo-root ignores.
	return [resolved({ name: "isentinel/gitignore", strict: explicit })];
}
