import { GLOB_JSX, GLOB_SRC, GLOB_TSX } from "../../globs.ts";
import { stylisticJsxRules, stylisticRules } from "../../rules/stylistic.ts";
import type { StylisticConfig } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintStylistic(options: StylisticConfig = {}): Array<TypedOxlintConfigItem> {
	return [
		...createOxlintConfigs({
			name: "isentinel/stylistic",
			files: [GLOB_SRC],
			rules: stylisticRules(options),
		}),
		...createOxlintConfigs({
			name: "isentinel/stylistic/jsx",
			files: [GLOB_JSX, GLOB_TSX],
			rules: stylisticJsxRules(options),
		}),
	];
}
