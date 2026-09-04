import type { Options as PrettierOptions } from "prettier";

import { GLOB_SRC } from "../../globs.ts";
import { flawlessRules } from "../../rules/flawless.ts";
import type { OptionsHasRoblox, OptionsStylistic } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintFlawless(
	{
		excludeFiles,
		roblox = true,
		stylistic = true,
	}: OptionsHasRoblox & OptionsStylistic & { excludeFiles?: Array<string> } = {},
	prettierOptions: PrettierOptions = {},
): Array<TypedOxlintConfigItem> {
	const stylisticOptions = typeof stylistic === "object" ? stylistic : {};

	return createOxlintConfigs({
		name: excludeFiles ? "isentinel/flawless/complement" : "isentinel/flawless",
		...(excludeFiles ? { excludeFiles } : {}),
		files: [GLOB_SRC],
		rules: flawlessRules({
			maxLen: stylisticOptions.maxLen,
			printWidth:
				typeof prettierOptions.printWidth === "number"
					? prettierOptions.printWidth
					: undefined,
			roblox,
			stylistic,
			tabWidth:
				typeof prettierOptions.tabWidth === "number" ? prettierOptions.tabWidth : undefined,
		}),
	});
}
