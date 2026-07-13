import { GLOB_SRC } from "../../globs.ts";
import { eslintPluginRules } from "../../rules/eslint-plugin.ts";
import type { OptionsFiles, OptionsOverrides } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintEslintPlugin(
	options: OptionsFiles & OptionsOverrides = {},
): Array<TypedOxlintConfigItem> {
	const { overrides = {} } = options;
	const files = options.files?.flat() ?? [GLOB_SRC];

	return createOxlintConfigs({
		name: "isentinel/eslint-plugin",
		files,
		rules: {
			...eslintPluginRules(),
			...overrides,
		},
	});
}
