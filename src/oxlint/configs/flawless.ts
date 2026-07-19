import { GLOB_SRC } from "../../globs.ts";
import { flawlessRules } from "../../rules/flawless.ts";
import type { OptionsStylistic } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintFlawless(
	{ stylistic = true }: OptionsStylistic = {},
	prettierOptions: Record<string, unknown> = {},
): Array<TypedOxlintConfigItem> {
	const stylisticOptions = typeof stylistic === "object" ? stylistic : {};

	return createOxlintConfigs({
		name: "isentinel/flawless",
		files: [GLOB_SRC],
		rules: flawlessRules({
			maxLen: stylisticOptions.maxLen,
			printWidth:
				typeof prettierOptions["printWidth"] === "number"
					? prettierOptions["printWidth"]
					: undefined,
			stylistic,
			tabWidth:
				typeof prettierOptions["tabWidth"] === "number"
					? prettierOptions["tabWidth"]
					: undefined,
		}),
	});
}
