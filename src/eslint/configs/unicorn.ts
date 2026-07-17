import { GLOB_ROOT, GLOB_SRC } from "../../globs.ts";
import { unicornRootRules, unicornRules } from "../../rules/unicorn.ts";
import { interopDefault, mergeGlobs, toSourceGlob } from "../../utils.ts";
import type {
	OptionsHasRoblox,
	OptionsStylistic,
	OptionsUnicorn,
	TypedFlatConfigItem,
} from "../types.ts";

export async function unicorn({
	complementIgnores,
	nameReplacements,
	roblox = true,
	root: customRootGlobs,
	stylistic = true,
}: OptionsHasRoblox &
	OptionsStylistic &
	OptionsUnicorn & {
		/**
		 * When set, re-apply the non-roblox rules to every source (and root)
		 * file except these globs (the roblox scope), so the complement is
		 * linted as standard-TS/Node land.
		 */
		complementIgnores?: Array<string>;
		root?: Array<string>;
	} = {}): Promise<Array<TypedFlatConfigItem>> {
	const pluginUnicorn = await interopDefault(import("eslint-plugin-unicorn"));

	const rootGlobs = mergeGlobs(GLOB_ROOT.map(toSourceGlob), customRootGlobs?.map(toSourceGlob));

	return [
		{
			name: "isentinel/unicorn/setup",
			plugins: {
				unicorn: pluginUnicorn,
			},
		},
		{
			name: "isentinel/unicorn/rules",
			files: [GLOB_SRC],
			rules: unicornRules({ nameReplacements, roblox, stylistic }),
		},
		{
			name: "isentinel/unicorn/root",
			files: rootGlobs,
			rules: unicornRootRules({ nameReplacements, roblox }),
		},
		// The complement re-applies the non-roblox rules last, so it wins for
		// files outside the roblox scope. The root item comes after the main one
		// so root files keep their `checkFilenames: false` name-replacements.
		...(complementIgnores
			? [
					{
						name: "isentinel/unicorn/complement",
						files: [GLOB_SRC],
						ignores: complementIgnores,
						rules: unicornRules({ nameReplacements, roblox: false, stylistic }),
					},
					{
						name: "isentinel/unicorn/complement/root",
						files: rootGlobs,
						ignores: complementIgnores,
						rules: unicornRootRules({ nameReplacements, roblox: false }),
					},
				]
			: []),
	];
}
