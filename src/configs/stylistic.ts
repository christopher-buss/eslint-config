import type { Linter } from "eslint";

import { GLOB_JS, GLOB_JSX, GLOB_MARKDOWN_CODE, GLOB_SRC, GLOB_TS, GLOB_TSX } from "../globs";
import type { StylisticConfig, TypedFlatConfigItem } from "../types";
import { interopDefault, mergePrettierOptions, require } from "../utils";
import type { PrettierOptions } from "./prettier";

export const StylisticConfigDefaults: StylisticConfig = {
	indent: "tab",
	jsx: true,
	quotes: "double",
	semi: true,
};

export async function stylistic(
	options: StylisticConfig = {},
	prettierOptions: PrettierOptions = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { arrowLength, indent, jsx, quotes, semi } = {
		...StylisticConfigDefaults,
		...options,
	};

	const [pluginArrowReturnStyle, pluginStylistic, pluginAntfu] = await Promise.all([
		interopDefault(import("eslint-plugin-arrow-return-style-x")),
		interopDefault(import("@stylistic/eslint-plugin")),
		interopDefault(import("eslint-plugin-antfu")),
	]);

	const config = pluginStylistic.configs.customize({
		indent,
		jsx,
		pluginName: "style",
		quotes,
		semi,
	});

	function createArrowStyleRule(parser: string, maxLength?: number): Linter.RulesRecord {
		return {
			"arrow-style/arrow-return-style": [
				"error",
				{
					jsxAlwaysUseExplicitReturn: true,
					maxLen: maxLength ?? arrowLength ?? prettierOptions.printWidth ?? 100,
					maxObjectProperties: 2,
					namedExportsAlwaysUseExplicitReturn: true,
					objectReturnStyle: "complex-explicit" as const,
					usePrettier: mergePrettierOptions(prettierOptions, {
						parser,
						plugins: [require.resolve("@prettier/plugin-oxc")],
					}),
				},
			],
		};
	}

	return [
		{
			name: "isentinel/stylistic/setup",
			plugins: {
				"antfu": pluginAntfu,
				"arrow-style": pluginArrowReturnStyle,
				"style": pluginStylistic,
			},
		},
		{
			name: "isentinel/stylistic",
			files: [GLOB_SRC],
			rules: {
				...config.rules,

				"antfu/consistent-list-newline": "off",
				"antfu/if-newline": "off",
				"antfu/top-level-function": "error",

				"arrow-style/no-export-default-arrow": "error",

				"curly": ["error", "all"],

				"style/lines-between-class-members": [
					"error",
					{
						enforce: [{ blankLine: "always", next: "method", prev: "method" }],
					},
				],

				"style/object-property-newline": ["error", { allowAllPropertiesOnSameLine: true }],
				"style/padding-line-between-statements": [
					"error",
					{
						blankLine: "always",
						next: "*",
						prev: ["block", "block-like", "class", "export", "import"],
					},
					{
						blankLine: "never",
						next: "*",
						prev: ["case"],
					},
					{
						blankLine: "any",
						next: ["export", "import"],
						prev: ["export", "import"],
					},
					{
						blankLine: "any",
						next: "*",
						prev: ["do"],
					},
				],
				"style/quotes": [
					"error",
					"double",
					{
						allowTemplateLiterals: "never",
						avoidEscape: true,
					},
				],
				"style/spaced-comment": ["error", "always", { markers: ["!native", "!optimize"] }],
			},
		},
		{
			name: "isentinel/stylistic/ts",
			files: [GLOB_TS, GLOB_TSX],
			rules: {
				...createArrowStyleRule("oxc-ts"),
			},
		},
		{
			name: "isentinel/stylistic/js",
			files: [GLOB_JS, GLOB_JSX],
			rules: {
				...createArrowStyleRule("oxc"),
			},
		},
		{
			name: "isentinel/stylistic/markdown-code",
			files: [GLOB_MARKDOWN_CODE],
			rules: {
				...createArrowStyleRule("oxc", Number(prettierOptions["jsdocPrintWidth"]) || 80),
			},
		},
	];
}
