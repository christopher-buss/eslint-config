import { GLOB_ROOT, GLOB_ROOT_EXCLUDE, GLOB_SRC } from "../../globs.ts";
import type { UnicornNameReplacements } from "../../rules/unicorn.ts";
import { unicornRootRules, unicornRules } from "../../rules/unicorn.ts";
import type { OptionsHasRoblox, OptionsStylistic } from "../../types.ts";
import { toSourceGlob } from "../../utils.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintUnicorn({
	excludeFiles,
	nameReplacements,
	roblox = true,
	root: customRootGlobs,
	stylistic = true,
}: OptionsHasRoblox &
	OptionsStylistic & {
		excludeFiles?: Array<string>;
		nameReplacements?: UnicornNameReplacements;
		root?: Array<string>;
	} = {}): Array<TypedOxlintConfigItem> {
	const rootGlobs = (customRootGlobs ?? GLOB_ROOT).map(toSourceGlob);

	return [
		...createOxlintConfigs({
			name: "isentinel/unicorn",
			...(excludeFiles ? { excludeFiles } : {}),
			files: [GLOB_SRC],
			rules: unicornRules({ nameReplacements, roblox, stylistic }),
		}),
		...createOxlintConfigs({
			name: "isentinel/unicorn/root",
			excludeFiles: [...GLOB_ROOT_EXCLUDE, ...(excludeFiles ?? [])],
			files: rootGlobs,
			rules: unicornRootRules({ nameReplacements, roblox }),
		}),
	];
}
