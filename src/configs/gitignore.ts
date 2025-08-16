import type { FlatGitignoreOptions } from "eslint-config-flat-gitignore";
import fs from "node:fs";

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
		return [resolved(config)];
	}

	if (fs.existsSync(".gitignore")) {
		const resolved = await interopDefault(import("eslint-config-flat-gitignore"));
		return [
			resolved({
				files: [".gitignore", ".git/info/exclude"],
				strict: false,
			}),
		];
	}

	if (explicit) {
		throw new Error(
			"gitignore option is enabled but no .gitignore file was found in the current directory",
		);
	}

	return [];
}
