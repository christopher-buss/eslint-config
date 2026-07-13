import { GLOB_SRC } from "../../globs.ts";
import type { SpellingRuleOptions } from "../../rules/spelling.ts";
import { spellingRules } from "../../rules/spelling.ts";
import type { OptionsComponentExtensions, OptionsFiles } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintSpelling(
	options: OptionsComponentExtensions & OptionsFiles & SpellingRuleOptions = {},
): Array<TypedOxlintConfigItem> {
	const { componentExts: componentExtensions = [] } = options;

	const files = options.files?.flat() ?? [
		GLOB_SRC,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	return createOxlintConfigs({
		name: "isentinel/spelling",
		files,
		rules: spellingRules(options),
	});
}
