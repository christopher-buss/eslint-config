import { GLOB_JSX, GLOB_SRC, GLOB_TSX } from "../../globs.ts";
import type { PerfectionistRuleOptions } from "../../rules/perfectionist.ts";
import {
	perfectionistJsxRules,
	perfectionistRules,
	perfectionistSettings,
} from "../../rules/perfectionist.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintPerfectionist(
	config?: PerfectionistRuleOptions,
): Array<TypedOxlintConfigItem> {
	return [
		...createOxlintConfigs({
			name: "isentinel/perfectionist",
			files: [GLOB_SRC],
			rules: perfectionistRules(config),
			settings: perfectionistSettings,
		}),
		...createOxlintConfigs({
			name: "isentinel/perfectionist/jsx",
			files: [GLOB_JSX, GLOB_TSX],
			rules: perfectionistJsxRules(config),
		}),
	];
}
