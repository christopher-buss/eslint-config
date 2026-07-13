import { GLOB_SRC, GLOB_TESTS } from "../../globs.ts";
import type { E18eRuleOptions } from "../../rules/e18e.ts";
import { e18eRules } from "../../rules/e18e.ts";
import type { OptionsIsInEditor, OptionsOverrides, OptionsProjectType } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintE18e({
	isInEditor = false,
	modernization = true,
	type = "game",
	moduleReplacements = type === "package" && isInEditor,
	overrides = {},
	performanceImprovements = true,
}: E18eRuleOptions &
	OptionsIsInEditor &
	OptionsOverrides &
	OptionsProjectType = {}): Array<TypedOxlintConfigItem> {
	return [
		...createOxlintConfigs({
			name: "isentinel/e18e",
			files: [GLOB_SRC],
			rules: {
				...e18eRules({ modernization, moduleReplacements, performanceImprovements }),
				...overrides,
			},
		}),
		...createOxlintConfigs({
			name: "isentinel/e18e/disables/test",
			files: [...GLOB_TESTS],
			rules: {
				"e18e/prefer-static-regex": "off",
			},
		}),
	];
}
