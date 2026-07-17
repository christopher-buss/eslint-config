import type { OptionsIsInEditor, OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

/**
 * Small-rules rules shared between the ESLint and oxlint factories.
 *
 * These do not require type information. The type-aware
 * `flawless/prefer-read-only-props` replaces the former read-only-props rule
 * and is configured by the flawless config.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function smallRulesRules({
	isInEditor = false,
	stylistic = true,
}: OptionsIsInEditor & OptionsStylistic = {}): TypedFlatConfigItem["rules"] {
	return {
		"small-rules/no-commented-code": isInEditor ? "off" : "error",
		"small-rules/prefer-class-properties": "error",
		"small-rules/prefer-early-return": ["error", { maximumStatements: 1 }],
		"small-rules/strict-component-boundaries": "error",

		...(stylistic !== false
			? {
					"small-rules/prefer-module-scope-constants": "error",
					"small-rules/prefer-singular-enums": "error",
				}
			: {}),
	};
}
