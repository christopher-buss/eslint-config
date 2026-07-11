import globals from "globals";

import { GLOB_SRC } from "../../globs.ts";
import { javascriptRules } from "../../rules/javascript.ts";
import { interopDefault } from "../../utils.ts";
import type {
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";

export async function javascript({
	isInEditor = false,
	overrides = {},
	roblox = true,
	stylistic = true,
}: OptionsFiles &
	OptionsHasRoblox &
	OptionsIsInEditor &
	OptionsOverrides &
	OptionsStylistic = {}): Promise<Array<TypedFlatConfigItem>> {
	const [pluginAntfu, pluginDeMorgan, pluginMaxParameters, pluginUnusedImports] =
		await Promise.all([
			interopDefault(import("eslint-plugin-antfu")),
			interopDefault(import("eslint-plugin-de-morgan")),
			// @ts-expect-error -- No types
			interopDefault(import("eslint-plugin-better-max-params")),
			interopDefault(import("eslint-plugin-unused-imports")),
		] as const);

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
	];
}
