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
	OptionsOverridesTypeAware,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types.ts";
import type { PrettierOptions } from "./oxfmt.ts";

export async function flawless(
	options: OptionsOverridesTypeAware &
		OptionsStylistic &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes = {},
	prettierOptions: PrettierOptions = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { overridesTypeAware = {}, stylistic = true, typeAware = true } = options;

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

	const typeAwareRules: TypedFlatConfigItem["rules"] = {
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
			rules: flawlessRules({
				maxLen: stylisticOptions.maxLen,
				printWidth,
				stylistic,
				tabWidth,
			}),
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
