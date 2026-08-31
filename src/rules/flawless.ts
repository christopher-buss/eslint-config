import type { OptionsHasRoblox, OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

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
 * type-aware `flawless/naming-convention`,
 * `flawless/no-redundant-type-annotation`, `flawless/no-unknown-returns` and
 * `flawless/prefer-read-only-props`, the test-only
 * `flawless/padding-after-expect-assertions`, and the non-JS
 * `flawless/no-redundant-tsconfig-options`, `flawless/toml-*` and
 * `flawless/yaml-*` rules are configured by their own configs.
 *
 * `flawless/no-reflect-get` and `flawless/no-reflect-set` are complement-only:
 * `Reflect` has no declaration in `@rbxts/types`, so they can only fire in
 * standard-TS/Node land.
 *
 * @param options - Shared stylistic and arrow rule options.
 * @returns The rule map.
 */
export function flawlessRules({
	roblox = true,
	stylistic = true,
	...arrowOptions
}: ArrowStyleRuleOptions & OptionsHasRoblox & OptionsStylistic = {}): TypedFlatConfigItem["rules"] {
	return {
		"flawless/no-conditional-empty-object-spread": "error",
		"flawless/no-export-default-arrow": "error",
		"flawless/no-floating-point-equality": "error",
		"flawless/no-known-value-widening": "error",
		"flawless/no-object-parameters": "error",
		"flawless/no-shape-in-symbol-names": "error",
		"flawless/no-unsafe-dictionary-type": "error",

		...(stylistic === false
			? {}
			: {
					"flawless/max-lines-per-function": [
						"warn",
						{ max: 30, skipBlankLines: true, skipComments: true },
					] as const,
					"flawless/prefer-parameter-destructuring": "warn",

					...arrowStyleRules(arrowOptions),
				}),

		...(roblox
			? {}
			: {
					"flawless/no-reflect-get": "error",
					"flawless/no-reflect-set": "error",
				}),
	};
}
