import { GLOB_SRC } from "../../globs.ts";
import type {
	JsPluginRules,
	OxlintRules,
	StylisticConfig,
	TypedOxlintConfigItem,
} from "../types.ts";

export const StylisticConfigDefaults: StylisticConfig = {
	indent: "tab",
	jsx: true,
	quotes: "double",
	semi: true,
};

export function oxlintStylistic(options: StylisticConfig = {}): Array<TypedOxlintConfigItem> {
	const { quotes } = {
		...StylisticConfigDefaults,
		...options,
	};

	const nativeRules = {
		"eslint/curly": ["error", "all"],
	} as const satisfies OxlintRules;

	const jsPluginRules = {
		"antfu/consistent-list-newline": "off",
		"antfu/if-newline": "off",
		"antfu/top-level-function": "error",

		"arrow-style/no-export-default-arrow": "error",

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
			quotes ?? "double",
			{
				allowTemplateLiterals: "never",
				avoidEscape: true,
			},
		],
		"style/spaced-comment": ["error", "always", { markers: ["!native", "!optimize"] }],
	} satisfies JsPluginRules;

	return [
		{
			name: "isentinel/oxlint/stylistic",
			files: [GLOB_SRC],
			plugins: ["eslint"],
			rules: nativeRules,
		},
		{
			name: "isentinel/oxlint/stylistic/js-plugin",
			files: [GLOB_SRC],
			jsPlugins: [
				{ name: "antfu", specifier: "eslint-plugin-antfu" },
				{ name: "arrow-style", specifier: "eslint-plugin-arrow-return-style-x" },
				{ name: "style", specifier: "@stylistic/eslint-plugin" },
			],
			rules: jsPluginRules,
		},
	];
}
