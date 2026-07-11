import { GLOB_TS, GLOB_TSX } from "../../globs.ts";
import {
	erasableSyntaxOnlyRules,
	typescriptRules,
	typescriptStrictPresetRules,
	typescriptTypeAwareRules,
} from "../../rules/typescript.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsOverrides,
	OptionsStylistic,
	OptionsTypeScriptErasableOnly,
} from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintTypescript(
	options: OptionsComponentExtensions &
		OptionsFiles &
		OptionsOverrides &
		OptionsStylistic &
		OptionsTypeScriptErasableOnly = {},
): Array<TypedOxlintConfigItem> {
	const {
		componentExts: componentExtensions = [],
		erasableOnly = false,
		overrides = {},
		stylistic = true,
	} = options;

	const files = options.files?.flat() ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	return createOxlintConfigs({
		name: "isentinel/typescript",
		files,
		rules: {
			...typescriptStrictPresetRules(),
			...typescriptRules({ stylistic }),
			// Type-aware rules are executed by oxlint-tsgolint and require
			// running oxlint with `--type-aware`.
			...typescriptTypeAwareRules(),
			...(erasableOnly ? erasableSyntaxOnlyRules() : {}),
			...overrides,
		},
	});
}
