import type { OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

export interface ArrowStyleRuleOptions {
	maxLen?: number;
	maxLength?: number;
	printWidth?: number;
	tabWidth?: number;
}

/**
 * Arrow return style rule on its own, for the Markdown code block override
 * where only the line width differs.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function arrowStyleRules({
	maxLen,
	maxLength,
	printWidth,
	tabWidth,
}: ArrowStyleRuleOptions = {}): TypedFlatConfigItem["rules"] {
	return {
		"flawless/arrow-return-style": [
			"error",
			{
				jsxAlwaysUseExplicitReturn: true,
				maxLen: maxLength ?? maxLen ?? printWidth ?? 100,
				maxObjectProperties: 2,
				namedExportsAlwaysUseExplicitReturn: true,
				objectReturnStyle: "complex-explicit" as const,
				...(tabWidth !== undefined ? { tabWidth } : {}),
				...(printWidth !== undefined ? { useOxfmt: { printWidth } } : {}),
			},
		],
	};
}

/**
 * Base (non-React) flawless rules shared between the ESLint and oxlint
 * factories. The React flawless rules live in the react rule map; the
 * type-aware `flawless/naming-convention` and the non-JS `flawless/toml-*` and
 * `flawless/yaml-*` rules are configured by their own configs and stay in
 * ESLint.
 *
 * @param options - Shared stylistic and arrow rule options.
 * @returns The rule map.
 */
export function flawlessRules({
	stylistic = true,
	...arrowOptions
}: ArrowStyleRuleOptions & OptionsStylistic = {}): TypedFlatConfigItem["rules"] {
	if (stylistic === false) {
		return {};
	}

	return {
		"flawless/no-export-default-arrow": "error",
		"flawless/prefer-parameter-destructuring": "warn",

		...arrowStyleRules(arrowOptions),
	};
}
