import { GLOB_SRC } from "../../globs.ts";
import { sonarjsRules } from "../../rules/sonarjs.ts";
import type { OptionsHasRoblox, OptionsIsInEditor } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintSonarjs({
	excludeFiles,
	isInEditor,
	roblox,
}: OptionsHasRoblox &
	Required<OptionsIsInEditor> & { excludeFiles?: Array<string> }): Array<TypedOxlintConfigItem> {
	return createOxlintConfigs({
		name: excludeFiles ? "isentinel/sonarjs/complement" : "isentinel/sonarjs",
		...(excludeFiles ? { excludeFiles } : {}),
		files: [GLOB_SRC],
		rules: sonarjsRules({ isInEditor, roblox }),
	});
}
