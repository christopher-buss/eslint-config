import type { OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

/**
 * Import rules shared between the ESLint and oxlint factories.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function importsRules({ stylistic = true }: OptionsStylistic = {}): NonNullable<
	TypedFlatConfigItem["rules"]
> {
	return {
		"antfu/import-dedupe": "error",
		"antfu/no-import-dist": "error",
		"antfu/no-import-node-modules-by-path": "error",

		"import/first": "error",
		"import/no-mutable-exports": "error",
		"import/no-named-default": "error",

		...(stylistic !== false
			? {
					"import/newline-after-import": ["error", { considerComments: true, count: 1 }],
				}
			: {}),
	};
}

/**
 * Game-only import restrictions shared between the ESLint and oxlint
 * factories.
 *
 * @returns The rule map.
 */
export function importsGameRules(): NonNullable<TypedFlatConfigItem["rules"]> {
	return {
		"no-restricted-syntax": [
			"error",
			{
				message: "Prefer named exports",
				selector: "ExportDefaultDeclaration",
			},
		],
	};
}
