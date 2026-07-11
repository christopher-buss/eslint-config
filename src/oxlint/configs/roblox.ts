import { robloxRules } from "../../rules/roblox.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsOverrides,
	OptionsStylistic,
} from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintRoblox(
	options: OptionsComponentExtensions & OptionsFiles & OptionsOverrides & OptionsStylistic = {},
): Array<TypedOxlintConfigItem> {
	const { componentExts: componentExtensions = [], overrides = {}, stylistic = true } = options;

	const files = options.files?.flat() ?? [
		"**/*/*.?([cm])ts",
		"**/*/*.?([cm])tsx",
		...componentExtensions.map((extension) => `**/*/*.${extension}`),
	];

	return createOxlintConfigs({
		name: "isentinel/roblox",
		files,
		rules: {
			...robloxRules({ stylistic }),
			...overrides,
		},
	});
}
