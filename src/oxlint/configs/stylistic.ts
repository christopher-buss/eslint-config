import { GLOB_JS, GLOB_JSX, GLOB_SRC, GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { arrowStyleRules, stylisticRules } from "../../rules/stylistic.ts";
import type { StylisticConfig } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintStylistic(
	options: StylisticConfig = {},
	prettierOptions: Record<string, unknown> = {},
): Array<TypedOxlintConfigItem> {
	const { arrowLength } = options;

	const arrowRules = arrowStyleRules({
		arrowLength,
		printWidth:
			typeof prettierOptions["printWidth"] === "number"
				? prettierOptions["printWidth"]
				: undefined,
		usePrettier: prettierOptions,
	});

	return [
		...createOxlintConfigs({
			name: "isentinel/stylistic",
			files: [GLOB_SRC],
			rules: stylisticRules(options),
		}),
		...createOxlintConfigs({
			name: "isentinel/stylistic/ts",
			files: [GLOB_TS, GLOB_TSX],
			rules: arrowRules,
		}),
		...createOxlintConfigs({
			name: "isentinel/stylistic/js",
			files: [GLOB_JS, GLOB_JSX],
			rules: arrowRules,
		}),
	];
}
