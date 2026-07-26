import globals from "globals";

import { GLOB_SRC } from "../../globs.ts";
import { javascriptRules } from "../../rules/javascript.ts";
import { interopDefault } from "../../utils.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type {
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";

export async function javascript({
	complementIgnores,
	isInEditor = false,
	overrides = {},
	roblox = true,
	stylistic = true,
}: OptionsFiles &
	OptionsHasRoblox &
	OptionsIsInEditor &
	OptionsOverrides &
	OptionsStylistic & {
		/**
		 * When set, re-apply the non-roblox rules to every source file except
		 * these globs (the roblox scope), so the complement is linted as
		 * standard-TS/Node land.
		 */
		complementIgnores?: Array<string>;
	} = {}): Promise<Array<TypedFlatConfigItem>> {
	const pluginAntfu = lazyPlugin("eslint-plugin-antfu");
	const pluginDeMorgan = lazyPlugin("eslint-plugin-de-morgan");
	const pluginMaxParameters = lazyPlugin("eslint-plugin-better-max-params");
	const pluginUnusedImports = await interopDefault(import("eslint-plugin-unused-imports"));

	return [
		{
			name: "isentinel/javascript/setup",
			languageOptions: {
				ecmaVersion: "latest",
				globals: {
					...globals.browser,
					...globals.es2021,
					...globals.node,
					document: "readonly",
					navigator: "readonly",
					window: "readonly",
				},
				parserOptions: {
					ecmaFeatures: {
						jsx: true,
					},
					ecmaVersion: "latest",
					sourceType: "module",
				},
				sourceType: "module",
			},
			linterOptions: {
				reportUnusedDisableDirectives: true,
			},
		},
		{
			name: "isentinel/javascript/rules",
			files: [GLOB_SRC],
			plugins: {
				"antfu": pluginAntfu,
				"better-max-params": pluginMaxParameters,
				"de-morgan": pluginDeMorgan,
				"unused-imports": pluginUnusedImports,
			},
			rules: {
				...javascriptRules({ isInEditor, roblox, stylistic }),

				...overrides,
			},
		},
		...(complementIgnores
			? [
					{
						name: "isentinel/javascript/complement",
						files: [GLOB_SRC],
						ignores: complementIgnores,
						rules: {
							...javascriptRules({ isInEditor, roblox: false, stylistic }),

							...overrides,
						},
					},
				]
			: []),
	];
}
