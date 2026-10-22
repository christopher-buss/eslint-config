import {
	GLOB_DTS,
	GLOB_MARKDOWN,
	GLOB_MARKDOWN_CODE,
	GLOB_SRC,
	GLOB_TS,
	GLOB_TSX,
} from "../../globs.ts";
import { arrowStyleRules, flawlessRules, flawlessTypeAwareRules } from "../../rules/flawless.ts";
import type { FlawlessRuleOptions } from "../../rules/flawless.ts";
import { getTsConfig, interopDefault } from "../../utils.ts";
import type { MarkdownWidthOverride, MarkdownWidths } from "../../utils.ts";
import type {
	OptionsOverridesTypeAware,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types.ts";
import type { PrettierOptions } from "./oxfmt.ts";

export async function flawless(
	options: FlawlessRuleOptions &
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
			/**
			 * The widths oxfmt formats Markdown code blocks with, when it
			 * formats Markdown: it formats embedded code with the Markdown
			 * options, not the root ones.
			 */
			markdownCode?: MarkdownWidths;
			/** Oxfmt config overrides that change the Markdown widths. */
			markdownCodeOverrides?: Array<MarkdownWidthOverride>;
		} = {},
	prettierOptions: PrettierOptions = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		antiSlop = false,
		complementIgnores,
		markdownCode = {},
		markdownCodeOverrides = [],
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
		antiSlop,
		maxLen: stylisticOptions.maxLen,
		printWidth,
		stylistic,
		tabWidth,
	};

	function markdownCodeRules(widths: MarkdownWidths): TypedFlatConfigItem["rules"] {
		return arrowStyleRules({
			maxLength: Number(prettierOptions["jsdocPrintWidth"]) || 80,
			printWidth: widths.printWidth ?? printWidth,
			tabWidth: widths.tabWidth ?? tabWidth,
		});
	}

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
						rules: markdownCodeRules(markdownCode),
					},
					// Each override reaches only the code blocks of the files it
					// matches, as in oxfmt.
					...markdownCodeOverrides.map(({ files, widths }, index) => {
						return {
							name: `isentinel/flawless/markdown-code/override-${index}`,
							files: files.map((glob) => `${glob}/${GLOB_SRC}`),
							rules: markdownCodeRules({ ...markdownCode, ...widths }),
						};
					}),
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
							...flawlessTypeAwareRules({ antiSlop, roblox }),
							...overridesTypeAware,
						},
					},
				]
			: []),
		// Type-aware counterpart of the complement above. `overridesTypeAware`
		// is re-spread so user overrides still beat it.
		...(isTypeAware && complementIgnores
			? [
					{
						name: "isentinel/flawless/rules-type-aware/complement",
						files: filesTypeAware,
						ignores: [...ignoresTypeAware, ...complementIgnores],
						rules: {
							...flawlessTypeAwareRules({ antiSlop, roblox: false }),
							...overridesTypeAware,
						},
					},
				]
			: []),
	];
}
