import { GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { smallRulesRules } from "../../rules/small-rules.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsIsInEditor,
	OptionsStylistic,
} from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintSmallRules(
	options: OptionsComponentExtensions & OptionsFiles & OptionsIsInEditor & OptionsStylistic = {},
): Array<TypedOxlintConfigItem> {
	const {
		componentExts: componentExtensions = [],
		isInEditor = false,
		stylistic = true,
	} = options;

	const files = options.files?.flat() ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	return createOxlintConfigs({
		name: "isentinel/small-rules",
		files,
		rules: smallRulesRules({ isInEditor, stylistic }),
	});
}
