import type { TypedFlatConfigItem } from "../types.ts";

export interface E18eRuleOptions {
	modernization?: boolean;
	moduleReplacements?: boolean;
	performanceImprovements?: boolean;
}

/**
 * The e18e rules shared between the ESLint and oxlint factories. Mirrors the
 * `modernization`, `moduleReplacements` and `performanceImprovements` presets
 * of `@e18e/eslint-plugin`; all rules are syntax-only (no type information).
 *
 * @param options - Which preset groups to enable.
 * @returns The rule map.
 */
export function e18eRules({
	modernization = true,
	moduleReplacements = false,
	performanceImprovements = true,
}: E18eRuleOptions = {}): TypedFlatConfigItem["rules"] {
	return {
		...(modernization
			? {
					"e18e/prefer-array-at": "error",
					"e18e/prefer-array-fill": "error",
					"e18e/prefer-array-to-reversed": "error",
					"e18e/prefer-array-to-sorted": "error",
					"e18e/prefer-array-to-spliced": "error",
					"e18e/prefer-includes": "error",
					"e18e/prefer-nullish-coalescing": "error",
					"e18e/prefer-object-has-own": "error",
					"e18e/prefer-spread-syntax": "error",
					"e18e/prefer-url-canparse": "error",
				}
			: {}),

		...(moduleReplacements ? { "e18e/ban-dependencies": "error" } : {}),

		...(performanceImprovements
			? {
					"e18e/prefer-array-from-map": "error",
					"e18e/prefer-array-some": "error",
					"e18e/prefer-date-now": "error",
					"e18e/prefer-regex-test": "error",
					"e18e/prefer-static-regex": "error",
					"e18e/prefer-string-fromcharcode": "error",
					"e18e/prefer-timer-args": "error",
				}
			: {}),
	};
}
