import { GLOB_JS, GLOB_JSX, GLOB_MARKDOWN_CODE, GLOB_SRC, GLOB_TS, GLOB_TSX } from "../../globs.ts";
import type {
	JsPluginRules,
	OptionsFormatters,
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

export function oxlintStylistic(
	options: StylisticConfig = {},
	formatterOptions: OptionsFormatters = {},
): Array<TypedOxlintConfigItem> {
	const { arrowLength, quotes } = {
		...StylisticConfigDefaults,
		...options,
	};

	const { oxfmtOptions = {} } = formatterOptions;

	function createArrowStyleRules(maxLength?: number): JsPluginRules {
		return {
			"arrow-style/arrow-return-style": [
				"error",
				{
					jsxAlwaysUseExplicitReturn: true,
					maxLen: maxLength ?? arrowLength ?? oxfmtOptions.printWidth ?? 100,
					maxObjectProperties: 2,
					namedExportsAlwaysUseExplicitReturn: true,
					objectReturnStyle: "complex-explicit" as const,
				},
			],
		} satisfies JsPluginRules;
	}

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

	const arrowStyleJsPlugins = [
		{ name: "arrow-style", specifier: "eslint-plugin-arrow-return-style-x" },
	];

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
				...arrowStyleJsPlugins,
				{ name: "style", specifier: "@stylistic/eslint-plugin" },
			],
			rules: jsPluginRules,
		},
		{
			name: "isentinel/oxlint/stylistic/arrow-ts",
			files: [GLOB_TS, GLOB_TSX],
			jsPlugins: arrowStyleJsPlugins,
			rules: createArrowStyleRules(),
		},
		{
			name: "isentinel/oxlint/stylistic/arrow-js",
			files: [GLOB_JS, GLOB_JSX],
			jsPlugins: arrowStyleJsPlugins,
			rules: createArrowStyleRules(),
		},
		{
			name: "isentinel/oxlint/stylistic/arrow-markdown",
			files: [GLOB_MARKDOWN_CODE],
			jsPlugins: arrowStyleJsPlugins,
			rules: createArrowStyleRules(Number(oxfmtOptions["jsdocPrintWidth"]) || 80),
		},
	];
}
