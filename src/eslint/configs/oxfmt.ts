import type { Options as PrettierOptions } from "prettier";

import { FORMATTED_FILES, resolveFormattedLanguages } from "../../formatted-files.ts";
import { GLOB_JSON5, GLOB_MARKDOWN } from "../../globs.ts";
import {
	buildOxfmtOptions,
	JSON5_OXFMT_OPTIONS,
	markdownOxfmtOptions,
	YAML_OXFMT_OPTIONS,
} from "../../rules/oxfmt.ts";
import type { OxfmtOptions } from "../../utils.ts";
import { interopDefault, parserPlain, renameRules } from "../../utils.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import { oxfmtMarkdownCode } from "../oxfmt-markdown-code.ts";
import { oxfmtSingleFix } from "../oxfmt-single-fix.ts";
import { defaultPluginRenaming } from "../plugin-renaming.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsFormatters,
	OptionsOverrides,
	TypedFlatConfigItem,
} from "../types.ts";

/** A code-block language: its name, its globs and its options layer. */
type CodeBlock = [name: string, files: Array<string>, layer: OxfmtOptions];

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
		return standalone ? {} : codeBlockRule(layer);
	}

	/**
	 * The `oxfmt/oxfmt` entry for Markdown code blocks, in every mode: oxfmt
	 * leaves them alone, and oxlint cannot read Markdown.
	 *
	 * @param layer - Options applied over the base options.
	 * @returns The rule entry.
	 */
	function codeBlockRule(layer: OxfmtOptions = {}): TypedFlatConfigItem["rules"] {
		// One root config, like the standalone CLI: nested configs are ignored.
		return {
			"oxfmt/oxfmt": ["error", { ...oxfmtOptions, ...layer, disableNestedConfig: true }],
		};
	}

	const pluginOxfmt = lazyPlugin("eslint-plugin-oxfmt", (plugin) => {
		return oxfmtSingleFix(oxfmtMarkdownCode(plugin));
	});
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
	// disables reach them. The code-block configs below format those.
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

	const codeBlocks = markdownCodeBlocks(languages, componentExtensions).map(
		([name, files, layer]) => {
			return {
				name: `isentinel/oxfmt/markdown-code/${name}`,
				// Each language glob, inside a Markdown file.
				files: files.map((glob) => `${GLOB_MARKDOWN}/${glob}`),
				rules: codeBlockRule(layer),
			};
		},
	);
	if (languages.markdown) {
		configs.push(...codeBlocks);
	} else {
		// The script blocks above match code blocks too: Markdown that is not
		// formatted keeps its code blocks as they are.
		configs.push({
			name: "isentinel/oxfmt/markdown-code",
			files: codeBlocks.flatMap((block) => block.files),
			rules: { "oxfmt/oxfmt": "off" },
		});
	}

	return configs;
}

/**
 * The code-block languages to format, with the options each one uses: the
 * same as a file of that language. Markdown blocks are left out: a config
 * that matches their virtual `*.md/*.md` files makes ESLint fail.
 *
 * @param languages - Which languages are formatted.
 * @param componentExtensions - Component extensions formatted as TypeScript.
 * @returns The code-block languages.
 */
function markdownCodeBlocks(
	languages: ReturnType<typeof resolveFormattedLanguages>,
	componentExtensions: Array<string>,
): Array<CodeBlock> {
	const blocks: Array<CodeBlock> = [
		["javascript", [...FORMATTED_FILES.javascript], {}],
		[
			"typescript",
			[
				...FORMATTED_FILES.typescript,
				...componentExtensions.map((extension) => `**/*.${extension}`),
			],
			{},
		],
	];

	if (languages.css) {
		blocks.push(
			["css", [...FORMATTED_FILES.css], {}],
			["scss", [...FORMATTED_FILES.scss], {}],
			["less", [...FORMATTED_FILES.less], {}],
		);
	}

	if (languages.html) {
		blocks.push(["html", [...FORMATTED_FILES.html], {}]);
	}

	if (languages.graphql) {
		blocks.push(["graphql", [...FORMATTED_FILES.graphql], {}]);
	}

	if (languages.json) {
		blocks.push(
			["json", [...FORMATTED_FILES.json], {}],
			["json5", [GLOB_JSON5], JSON5_OXFMT_OPTIONS],
		);
	}

	if (languages.yaml) {
		blocks.push(["yaml", [...FORMATTED_FILES.yaml], YAML_OXFMT_OPTIONS]);
	}

	return blocks;
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
