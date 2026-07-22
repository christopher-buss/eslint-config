import type { OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

/**
 * Roblox rules shared between the ESLint and oxlint factories.
 *
 * These do not require type information; the type-aware roblox rules stay in
 * the ESLint config (oxlint jsPlugins have no type information).
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function robloxRules({
	stylistic = true,
}: OptionsStylistic = {}): TypedFlatConfigItem["rules"] {
	return {
		"roblox/no-any": "error",

		"roblox/no-enum-merging": "error",
		"roblox/no-export-assignment-let": "error",
		"roblox/no-for-in": "error",
		"roblox/no-function-expression-name": "error",
		"roblox/no-get-set": "error",
		"roblox/no-implicit-self": "error",
		"roblox/no-invalid-identifier": "error",
		"roblox/no-namespace-merging": "error",
		"roblox/no-null": "error",
		"roblox/no-private-identifier": "error",
		"roblox/no-unsupported-syntax": "error",
		"roblox/no-user-defined-lua-tuple": "error",
		"roblox/no-value-typeof": "error",
		"roblox/prefer-get-players": "error",
		"roblox/prefer-task-library": "error",
		"small-rules/no-array-size-assignment": "error",
		"small-rules/no-recursive": "error",

		...(stylistic !== false
			? {
					"sentinel/prefer-math-min-max": "error",
					"small-rules/array-type-generic": "error",
					"small-rules/no-array-constructor-elements": "error",
				}
			: {}),
	};
}
