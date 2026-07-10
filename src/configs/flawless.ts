import { GLOB_TS } from "../globs.ts";
import type { OptionsStylistic, TypedFlatConfigItem } from "../types.ts";
import { interopDefault } from "../utils.ts";

export async function flawless(
	options: OptionsStylistic = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { stylistic = true } = options;

	const eslintPluginFlawless = await interopDefault(import("eslint-plugin-flawless"));

	return [
		{
			name: "isentinel/flawless/setup",
			plugins: {
				flawless: eslintPluginFlawless,
			},
		},
		{
			name: "isentinel/flawless/rules",
			files: [GLOB_TS],
			rules: {
				...(stylistic !== false
					? {
							"flawless/prefer-destructuring-assignment": "warn",
						}
					: {}),
			},
		},
	];
}
