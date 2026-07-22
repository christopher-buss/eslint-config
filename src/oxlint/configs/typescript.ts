import { GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { isTsgolintRule } from "../../rules/oxlint-mapping.ts";
import {
	erasableSyntaxOnlyRules,
	typescriptRecommendedOverrides,
	typescriptRules,
	typescriptStrictPresetRules,
	typescriptTypeAwareRules,
} from "../../rules/typescript.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsHasRoblox,
	OptionsOverrides,
	OptionsStylistic,
	OptionsTypeScriptErasableOnly,
	Rules,
} from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintTypescript(
	options: OptionsComponentExtensions &
		OptionsFiles &
		OptionsHasRoblox &
		OptionsOverrides &
		OptionsStylistic &
		OptionsTypeScriptErasableOnly & {
			excludeFiles?: Array<string>;
			typeAware?: boolean;
		} = {},
): Array<TypedOxlintConfigItem> {
	const {
		componentExts: componentExtensions = [],
		erasableOnly = false,
		excludeFiles,
		overrides = {},
		roblox = true,
		stylistic = true,
		typeAware = true,
	} = options;

	const files = options.files?.flat() ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	const typeAwareRules = typescriptTypeAwareRules({ roblox }) ?? {};
	const gatedTypeAwareRules = typeAware
		? typeAwareRules
		: (Object.fromEntries(
				Object.entries(typeAwareRules).filter(([rule]) => !isTsgolintRule(rule)),
			) as Rules);

	return createOxlintConfigs({
		name: "isentinel/typescript",
		...(excludeFiles ? { excludeFiles } : {}),
		files,
		rules: {
			...typescriptRecommendedOverrides(),
			...typescriptStrictPresetRules(),
			...typescriptRules({ stylistic }),
			...gatedTypeAwareRules,
			...(erasableOnly ? erasableSyntaxOnlyRules() : {}),
			...overrides,
		},
	});
}
