import type { OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

/**
 * Base (non-React) flawless rules shared between the ESLint and oxlint
 * factories. The React flawless rules live in the react rule map; the
 * type-aware `flawless/naming-convention` and the non-JS `flawless/toml-*` and
 * `flawless/yaml-*` rules are configured by their own configs and stay in
 * ESLint.
 *
 * @param options - Shared stylistic options.
 * @returns The rule map.
 */
export function flawlessRules({
	stylistic = true,
}: OptionsStylistic = {}): TypedFlatConfigItem["rules"] {
	return {
		...(stylistic !== false ? { "flawless/prefer-parameter-destructuring": "warn" } : {}),
	};
}
