import type { Options as PrettierOptions } from "prettier";

import { FORMATTED_FILES, resolveFormattedLanguages } from "../../formatted-files.ts";
import { GLOB_JSON5 } from "../../globs.ts";
import {
	buildOxfmtOptions,
	JSON5_OXFMT_OPTIONS,
	markdownOxfmtOptions,
	YAML_OXFMT_OPTIONS,
} from "../../rules/oxfmt.ts";
import type { OxfmtOptions } from "../../utils.ts";
import { interopDefault, parserPlain, renameRules } from "../../utils.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import { defaultPluginRenaming } from "../plugin-renaming.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsFormatters,
	OptionsOverrides,
	TypedFlatConfigItem,
} from "../types.ts";

export async function oxfmt(
	options?: OptionsComponentExtensions &
		OptionsFiles &
		OptionsOverrides & {
			formatters?: OptionsFormatters | true;
			oxfmtConfigOptions?: OxfmtOptions;
			oxfmtOptions?: OxfmtOptions;
			oxlint?: boolean;
			prettierOptions?: PrettierOptions;
			/**
			 * Oxfmt runs as its own tool: keep the formatter-conflict
			 * disables and the plain parsers but enable `oxfmt/oxfmt` nowhere.
			 */
			standalone?: boolean;
		},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		files: oxfmtFiles,
		formatters = {},
		oxfmtConfigOptions = {},
		oxfmtOptions: userOxfmtOptions,
		oxlint: enableOxlint = false,
		prettierOptions = {},
		standalone = false,
	} = options ?? {};

	const languages = resolveFormattedLanguages(formatters);

	const oxfmtOptions = buildOxfmtOptions({
		oxfmtConfigOptions,
		oxfmtOptions: userOxfmtOptions,
		prettierOptions,
	});

	/**
	 * The `oxfmt/oxfmt` entry for a block, with an options layer over the
	 * base; none when oxfmt runs on its own.
	 *
	 * @param layer - Options applied over the base options.
	 * @returns The rule entry, or no rules.
	 */
	function formatRule(layer: OxfmtOptions = {}): TypedFlatConfigItem["rules"] {
		return standalone ? {} : { "oxfmt/oxfmt": ["error", { ...oxfmtOptions, ...layer }] };
	}

	const pluginOxfmt = lazyPlugin("eslint-plugin-oxfmt");
	const configPrettier = await interopDefault(import("eslint-config-prettier/flat"));

	const rulesToIgnore = ["curly", "style/quotes"];
	const rules = renameRules(configPrettier.rules, defaultPluginRenaming);
	for (const rule of rulesToIgnore) {
		delete rules[rule];
	}

	const configs: Array<TypedFlatConfigItem> = [
		{
			name: "isentinel/oxfmt/setup",
			plugins: {
				oxfmt: pluginOxfmt,
			},
		},
	];

	// The script globs also match Markdown code blocks, so the conflict
	// disables reach them. The rule itself skips those virtual files.
	const scriptBlocks = [
		["javascript", oxfmtFiles ?? [...FORMATTED_FILES.javascript]],
		[
			"typescript",
			oxfmtFiles ?? [
				...FORMATTED_FILES.typescript,
				...componentExtensions.map((extension) => `**/*.${extension}`),
			],
		],
	] as const;

	for (const [name, files] of scriptBlocks) {
		configs.push({
			name: `isentinel/oxfmt/${name}`,
			files,
			rules: {
				...rules,
				"arrow-body-style": "off",
				// When running alongside oxlint, oxlint formats JS/TS files;
				// ESLint keeps the formatting-conflict disables.
				...(enableOxlint ? {} : formatRule()),
				"prefer-arrow-callback": "off",
			},
		});
	}

	if (languages.css) {
		configs.push(
			plainBlock("css", [...FORMATTED_FILES.css], formatRule()),
			plainBlock("scss", [...FORMATTED_FILES.scss], formatRule()),
			plainBlock("less", [...FORMATTED_FILES.less], formatRule()),
		);
	}

	if (languages.html) {
		configs.push(plainBlock("html", [...FORMATTED_FILES.html], formatRule()));
	}

	// The blocks below only enable the rule, so oxfmt on its own needs none.
	if (!standalone && languages.markdown) {
		configs.push({
			name: "isentinel/oxfmt/markdown",
			files: [...FORMATTED_FILES.markdown],
			rules: formatRule(markdownOxfmtOptions(prettierOptions["jsdocPrintWidth"])),
		});
	}

	if (languages.graphql) {
		configs.push(plainBlock("graphql", [...FORMATTED_FILES.graphql], formatRule()));
	}

	if (!standalone && languages.json) {
		configs.push(
			{
				name: "isentinel/oxfmt/json",
				files: [...FORMATTED_FILES.json],
				rules: formatRule(),
			},
			{
				name: "isentinel/oxfmt/json5",
				files: [GLOB_JSON5],
				rules: formatRule(JSON5_OXFMT_OPTIONS),
			},
		);
	}

	if (!standalone && languages.yaml) {
		configs.push({
			name: "isentinel/oxfmt/yaml",
			files: [...FORMATTED_FILES.yaml],
			rules: formatRule(YAML_OXFMT_OPTIONS),
		});
	}

	return configs;
}

/**
 * A block for a language ESLint has no parser for: the plain parser lets
 * `oxfmt/oxfmt` see the file, and keeps ESLint from parsing Markdown code
 * blocks in it as JavaScript.
 *
 * @param name - Appended to `isentinel/oxfmt/` to name the block.
 * @param files - Globs of the files the block applies to.
 * @param rules - Rules to enable for those files.
 * @returns The config block.
 */
function plainBlock(
	name: string,
	files: Array<string>,
	rules: TypedFlatConfigItem["rules"],
): TypedFlatConfigItem {
	return {
		name: `isentinel/oxfmt/${name}`,
		files,
		languageOptions: {
			parser: parserPlain,
		},
		rules,
	};
}

export { type OxfmtOptions } from "../../utils.ts";

export type { Options as PrettierOptions } from "prettier";
