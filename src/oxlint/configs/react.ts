import { GLOB_JSX, GLOB_TSX } from "../../globs.ts";
import type { ReactRuleOptions } from "../../rules/react.ts";
import { reactRules } from "../../rules/react.ts";
import type { OptionsFiles, OptionsOverrides } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintReact(
	options: OptionsFiles & OptionsOverrides & ReactRuleOptions & { importSource?: string } = {},
): Array<TypedOxlintConfigItem> {
	const {
		filenameCase = "kebabCase",
		importSource,
		overrides = {},
		reactCompiler = true,
		stylistic = true,
	} = options;

	const files = options.files?.flat() ?? [GLOB_JSX, GLOB_TSX];

	return createOxlintConfigs({
		name: "isentinel/react",
		files,
		rules: {
			...reactRules({ filenameCase, reactCompiler, stylistic }),
			...overrides,
		},
		settings: {
			"react-x": {
				importSource: importSource ?? "@rbxts",
				version: "17.0.2",
			},
		},
	});
}
