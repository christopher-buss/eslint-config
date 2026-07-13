import { GLOB_SRC } from "../../globs.ts";
import { jsdocRules } from "../../rules/jsdoc.ts";
import type { JsdocOptions, OptionsProjectType, OptionsStylistic } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintJsdoc(
	options: JsdocOptions & OptionsProjectType & OptionsStylistic = {},
): Array<TypedOxlintConfigItem> {
	return createOxlintConfigs({
		name: "isentinel/jsdoc",
		files: [GLOB_SRC],
		rules: jsdocRules(options),
	});
}
