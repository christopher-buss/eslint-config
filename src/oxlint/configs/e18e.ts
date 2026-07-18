import { GLOB_SRC, GLOB_TESTS } from "../../globs.ts";
import type { E18eRuleOptions } from "../../rules/e18e.ts";
import { e18eRules } from "../../rules/e18e.ts";
import type {
	OptionsFiles,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsProjectType,
} from "../../types.ts";
import { resolveNodeMajor } from "../../utils.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintE18e({
	excludeFiles,
	files = [GLOB_SRC],
	modernization = true,
	nodeMajor = resolveNodeMajor(),
	overrides = {},
	performanceImprovements = true,
}: E18eRuleOptions &
	OptionsFiles &
	OptionsIsInEditor &
	OptionsOverrides &
	OptionsProjectType & { excludeFiles?: Array<string> } = {}): Array<TypedOxlintConfigItem> {
	// `nodeMajor` is resolved by the factory from the shared settings; the
	// default only covers direct callers of this config function.
	return [
		...createOxlintConfigs({
			name: "isentinel/e18e",
			...(excludeFiles ? { excludeFiles } : {}),
			files: files.flat(),
			rules: {
				...e18eRules({ modernization, nodeMajor, performanceImprovements }),
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
