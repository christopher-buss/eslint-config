import { GLOB_ROOT, GLOB_SRC } from "../../globs.ts";
import type { UnicornNameReplacements } from "../../rules/unicorn.ts";
import { unicornRootRules, unicornRules } from "../../rules/unicorn.ts";
import type { OptionsHasRoblox, OptionsStylistic } from "../../types.ts";
import { mergeGlobs, toSourceGlob } from "../../utils.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintUnicorn({
	nameReplacements,
	roblox = true,
	root: customRootGlobs,
	stylistic = true,
}: OptionsHasRoblox &
	OptionsStylistic & {
		nameReplacements?: UnicornNameReplacements;
		root?: Array<string>;
	} = {}): Array<TypedOxlintConfigItem> {
	const rootGlobs = mergeGlobs(GLOB_ROOT.map(toSourceGlob), customRootGlobs?.map(toSourceGlob));

	return [
		...createOxlintConfigs({
			name: "isentinel/unicorn",
			files: [GLOB_SRC],
			rules: unicornRules({ nameReplacements, roblox, stylistic }),
		}),
		...createOxlintConfigs({
			name: "isentinel/unicorn/root",
			files: rootGlobs,
			rules: unicornRootRules({ nameReplacements, roblox }),
		}),
	];
}
