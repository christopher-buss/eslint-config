import { GLOB_SRC } from "../../globs.ts";
import { flawlessRules } from "../../rules/flawless.ts";
import type { FlawlessRuleOptions } from "../../rules/flawless.ts";
import type { OptionsStylistic } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintFlawless(
	{
		antiSlop = false,
		excludeFiles,
		roblox = true,
		stylistic = true,
	}: FlawlessRuleOptions & OptionsStylistic & { excludeFiles?: Array<string> } = {},
	prettierOptions: Record<string, unknown> = {},
): Array<TypedOxlintConfigItem> {
	const stylisticOptions = typeof stylistic === "object" ? stylistic : {};

	return createOxlintConfigs({
		name: excludeFiles ? "isentinel/flawless/complement" : "isentinel/flawless",
		...(excludeFiles ? { excludeFiles } : {}),
		files: [GLOB_SRC],
		rules: flawlessRules({
			antiSlop,
			maxLen: stylisticOptions.maxLen,
			printWidth:
				typeof prettierOptions["printWidth"] === "number"
					? prettierOptions["printWidth"]
					: undefined,
			roblox,
			stylistic,
			tabWidth:
				typeof prettierOptions["tabWidth"] === "number"
					? prettierOptions["tabWidth"]
					: undefined,
		}),
	});
}
