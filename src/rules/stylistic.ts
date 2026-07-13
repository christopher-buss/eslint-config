import type { StylisticConfig, TypedFlatConfigItem } from "../types.ts";

export interface ArrowStyleRuleOptions {
	arrowLength?: number;
	maxLength?: number;
	printWidth?: number;
	/** Prettier options forwarded to the rule (ESLint side only). */
	usePrettier?: Record<string, unknown>;
}

/**
 * Stylistic rules shared between the ESLint and oxlint factories.
 *
 * These complement the `@stylistic` customize preset (ESLint side) and are
 * the stylistic rules that survive the formatter disables.
 *
 * @param options - Resolved stylistic options.
 * @returns The rule map.
 */
export function stylisticRules({
	jsx = true,
	quotes = "double",
}: StylisticConfig = {}): TypedFlatConfigItem["rules"] {
	return {
		"antfu/consistent-list-newline": "off",
		"antfu/if-newline": "off",
		"antfu/top-level-function": "error",

		"arrow-style/no-export-default-arrow": "error",

		"curly": ["error", "all"],

		...(jsx
			? { "style/jsx-curly-brace-presence": ["error", { propElementValues: "always" }] }
			: {}),

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
			quotes,
			{
				allowTemplateLiterals: "never",
				avoidEscape: true,
			},
		],
		"style/spaced-comment": ["error", "always", { markers: ["!native", "!optimize"] }],
	};
}

/**
 * Arrow return style rule shared between the ESLint and oxlint factories.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function arrowStyleRules({
	arrowLength,
	maxLength,
	printWidth,
	usePrettier,
}: ArrowStyleRuleOptions = {}): TypedFlatConfigItem["rules"] {
	return {
		"arrow-style/arrow-return-style": [
			"error",
			{
				jsxAlwaysUseExplicitReturn: true,
				maxLen: maxLength ?? arrowLength ?? printWidth ?? 100,
				maxObjectProperties: 2,
				namedExportsAlwaysUseExplicitReturn: true,
				objectReturnStyle: "complex-explicit" as const,
				...(usePrettier ? { usePrettier } : {}),
			},
		],
	};
}
