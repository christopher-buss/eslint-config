import { GLOB_TS } from "../../globs.ts";
import { flawlessRules } from "../../rules/flawless.ts";
import { interopDefault } from "../../utils.ts";
import type { OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

export async function flawless({ stylistic = true }: OptionsStylistic = {}): Promise<
	Array<TypedFlatConfigItem>
> {
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
			rules: flawlessRules({ stylistic }),
		},
	];
}
