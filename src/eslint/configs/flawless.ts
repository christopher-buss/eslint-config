import {
	GLOB_DTS,
	GLOB_MARKDOWN,
	GLOB_MARKDOWN_CODE,
	GLOB_SRC,
	GLOB_TS,
	GLOB_TSX,
} from "../../globs.ts";
import { arrowStyleRules, flawlessRules } from "../../rules/flawless.ts";
import { getTsConfig, interopDefault } from "../../utils.ts";
import type {
	OptionsHasRoblox,
	OptionsOverridesTypeAware,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types.ts";
import type { PrettierOptions } from "./oxfmt.ts";

export async function flawless(
	options: OptionsHasRoblox &
		OptionsOverridesTypeAware &
		OptionsStylistic &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes & {
			/**
			 * When set, re-apply the non-roblox rules to every source file
			 * except these globs (the roblox scope), so the complement is
			 * linted as standard-TS/Node land.
			 */
			complementIgnores?: Array<string>;
		} = {},
	prettierOptions: PrettierOptions = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		complementIgnores,
		overridesTypeAware = {},
		roblox = true,
		stylistic = true,
		typeAware = true,
	} = options;

	const eslintPluginFlawless = await interopDefault(import("eslint-plugin-flawless"));

	const filesTypeAware = [GLOB_TS, GLOB_TSX];
	const ignoresTypeAware = options.ignoresTypeAware ?? [`${GLOB_MARKDOWN}/**`, GLOB_DTS];
	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	const stylisticOptions = typeof stylistic === "object" ? stylistic : {};
	const printWidth =
		typeof prettierOptions.printWidth === "number" ? prettierOptions.printWidth : undefined;
	const tabWidth =
		typeof prettierOptions.tabWidth === "number" ? prettierOptions.tabWidth : undefined;

	const sharedRuleOptions = {
		maxLen: stylisticOptions.maxLen,
		printWidth,
		stylistic,
		tabWidth,
	};

	const typeAwareRules: TypedFlatConfigItem["rules"] = {
		"flawless/no-redundant-type-annotation": "error",
		"flawless/no-unknown-returns": "error",
		"flawless/prefer-read-only-props": "error",
	};

	return [
		{
			name: "isentinel/flawless/setup",
			plugins: {
				flawless: eslintPluginFlawless,
			},
		},
		{
			name: "isentinel/flawless/rules",
			files: [GLOB_SRC],
			rules: flawlessRules({ ...sharedRuleOptions, roblox }),
		},
		...(stylistic !== false
			? [
					{
						name: "isentinel/flawless/markdown-code",
						files: [GLOB_MARKDOWN_CODE],
						rules: arrowStyleRules({
							maxLength: Number(prettierOptions["jsdocPrintWidth"]) || 80,
							printWidth,
							tabWidth,
						}),
					},
				]
			: []),
		// The complement re-applies the non-roblox rules last, so it wins for
		// files outside the roblox scope.
		...(complementIgnores
			? [
					{
						name: "isentinel/flawless/complement",
						files: [GLOB_SRC],
						ignores: complementIgnores,
						rules: flawlessRules({ ...sharedRuleOptions, roblox: false }),
					},
				]
			: []),
		...(isTypeAware
			? [
					{
						name: "isentinel/flawless/rules-type-aware",
						files: filesTypeAware,
						ignores: ignoresTypeAware,
						rules: {
							...typeAwareRules,
							...overridesTypeAware,
						},
					},
				]
			: []),
	];
}
