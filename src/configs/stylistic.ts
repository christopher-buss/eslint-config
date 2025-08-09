import { GLOB_SRC } from "../globs";
import type { StylisticConfig, TypedFlatConfigItem } from "../types";
import { interopDefault } from "../utils";

export const StylisticConfigDefaults: StylisticConfig = {
	indent: "tab",
	jsx: true,
	quotes: "double",
	semi: true,
};

export async function stylistic(
	options: StylisticConfig = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { indent, jsx, quotes, semi } = {
		...StylisticConfigDefaults,
		...options,
	};

	const [pluginArrowReturnStyle, pluginStylistic, pluginAntfu] = await Promise.all([
		interopDefault(import("eslint-plugin-arrow-return-style")),
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
			files: [GLOB_SRC],
			name: "isentinel/stylistic",
			rules: {
				...config.rules,

				"antfu/consistent-list-newline": "error",
				"antfu/if-newline": "off",
				"antfu/top-level-function": "error",

				"arrow-style/arrow-return-style": [
					"warn",
					{
						jsxAlwaysUseExplicitReturn: true,
						maxLen: 80,
					},
				],

				"arrow-style/no-export-default-arrow": "warn",

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
	];
}
