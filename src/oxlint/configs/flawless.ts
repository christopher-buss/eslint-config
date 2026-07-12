import { GLOB_TS } from "../../globs.ts";
import { flawlessRules } from "../../rules/flawless.ts";
import type { OptionsStylistic } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintFlawless({
	stylistic = true,
}: OptionsStylistic = {}): Array<TypedOxlintConfigItem> {
	return createOxlintConfigs({
		name: "isentinel/flawless",
		files: [GLOB_TS],
		rules: flawlessRules({ stylistic }),
	});
}
