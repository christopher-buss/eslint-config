import type { OptionsIsInEditor, OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

/**
 * Cease-nonsense rules shared between the ESLint and oxlint factories.
 *
 * These do not require type information; `cease-nonsense/prefer-read-only-props`
 * is type-aware and stays in the ESLint config.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function ceaseNonsenseRules({
	isInEditor = false,
	stylistic = true,
}: OptionsIsInEditor & OptionsStylistic = {}): TypedFlatConfigItem["rules"] {
	return {
		"cease-nonsense/no-commented-code": isInEditor ? "off" : "error",
		"cease-nonsense/prefer-class-properties": "error",
		"cease-nonsense/prefer-early-return": ["error", { maximumStatements: 1 }],
		"cease-nonsense/strict-component-boundaries": "error",

		...(stylistic !== false
			? {
					"cease-nonsense/prefer-module-scope-constants": "error",
					"cease-nonsense/prefer-singular-enums": "error",
				}
			: {}),
	};
}
