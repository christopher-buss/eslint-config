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
		OptionsOverrides &
		OptionsStylistic &
		OptionsTypeScriptErasableOnly & { typeAware?: boolean } = {},
): Array<TypedOxlintConfigItem> {
	const {
		componentExts: componentExtensions = [],
		erasableOnly = false,
		overrides = {},
		stylistic = true,
		typeAware = true,
	} = options;

	const files = options.files?.flat() ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	const typeAwareRules = typescriptTypeAwareRules() ?? {};
	const gatedTypeAwareRules = typeAware
		? typeAwareRules
		: (Object.fromEntries(
				Object.entries(typeAwareRules).filter(([rule]) => !isTsgolintRule(rule)),
			) as Rules);

	return createOxlintConfigs({
		name: "isentinel/typescript",
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
