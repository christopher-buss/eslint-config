import { GLOB_SRC } from "../../globs.ts";
import { sonarjsRules } from "../../rules/sonarjs.ts";
import type { OptionsHasRoblox, OptionsIsInEditor } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintSonarjs(
	options: OptionsHasRoblox & Required<OptionsIsInEditor>,
): Array<TypedOxlintConfigItem> {
	return createOxlintConfigs({
		name: "isentinel/sonarjs",
		files: [GLOB_SRC],
		rules: sonarjsRules(options),
	});
}
