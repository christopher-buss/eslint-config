import { GLOB_SRC } from "../../globs.ts";
import { stylisticRules } from "../../rules/stylistic.ts";
import type { StylisticConfig } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintStylistic(options: StylisticConfig = {}): Array<TypedOxlintConfigItem> {
	return createOxlintConfigs({
		name: "isentinel/stylistic",
		files: [GLOB_SRC],
		rules: stylisticRules(options),
	});
}
