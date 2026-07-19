import type { StylisticConfig, TypedFlatConfigItem } from "../types.ts";

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
