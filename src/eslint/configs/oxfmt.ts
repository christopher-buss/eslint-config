import type { Options as PrettierOptions } from "prettier";

import {
	GLOB_ALL_JSON,
	GLOB_CSS,
	GLOB_JS,
	GLOB_JSX,
	GLOB_LESS,
	GLOB_MARKDOWN,
	GLOB_POSTCSS,
	GLOB_SCSS,
	GLOB_TS,
	GLOB_TSX,
	GLOB_YAML,
} from "../../globs.ts";
import { buildOxfmtOptions, markdownOxfmtOptions, YAML_OXFMT_OPTIONS } from "../../rules/oxfmt.ts";
import type { OxfmtOptions } from "../../utils.ts";
import { interopDefault, parserPlain, renameRules, resolveWithDefaults } from "../../utils.ts";
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
			 * disables but enable `oxfmt/oxfmt` nowhere.
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

	const formattingOptions = {
		css: true,
		graphql: true,
		html: true,
		json: true,
		markdown: true,
		yaml: true,
		...resolveWithDefaults(formatters, {}),
	} satisfies OptionsFormatters;

	const oxfmtOptions = buildOxfmtOptions({
		oxfmtConfigOptions,
		oxfmtOptions: userOxfmtOptions,
		prettierOptions,
	});

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

	const jsFiles = oxfmtFiles ?? [
		GLOB_JS,
		GLOB_JSX,
		`${GLOB_MARKDOWN}/${GLOB_JS}`,
		`${GLOB_MARKDOWN}/${GLOB_JSX}`,
	];

	configs.push({
		name: "isentinel/oxfmt/javascript",
		files: jsFiles,
		rules: {
			...rules,
			"arrow-body-style": "off",
			// When running alongside oxlint, real JS/TS files are formatted by
			// oxlint; ESLint keeps the formatting-conflict disables and only
			// formats Markdown code blocks (below).
			...(enableOxlint || standalone ? {} : { "oxfmt/oxfmt": ["error", oxfmtOptions] }),
			"prefer-arrow-callback": "off",
		},
	});

	const tsFiles = oxfmtFiles ?? [
		GLOB_TS,
		GLOB_TSX,
		`${GLOB_MARKDOWN}/${GLOB_TS}`,
		`${GLOB_MARKDOWN}/${GLOB_TSX}`,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	configs.push({
		name: "isentinel/oxfmt/typescript",
		files: tsFiles,
		rules: {
			...rules,
			"arrow-body-style": "off",
			...(enableOxlint || standalone ? {} : { "oxfmt/oxfmt": ["error", oxfmtOptions] }),
			"prefer-arrow-callback": "off",
		},
	});

	if (standalone) {
		return configs;
	}

	if (enableOxlint) {
		configs.push({
			name: "isentinel/oxfmt/markdown-code",
			files: [
				`${GLOB_MARKDOWN}/${GLOB_JS}`,
				`${GLOB_MARKDOWN}/${GLOB_JSX}`,
				`${GLOB_MARKDOWN}/${GLOB_TS}`,
				`${GLOB_MARKDOWN}/${GLOB_TSX}`,
			],
			rules: {
				"oxfmt/oxfmt": ["error", oxfmtOptions],
			},
		});
	}

	if (formattingOptions.css) {
		configs.push(
			{
				name: "isentinel/oxfmt/css",
				files: [GLOB_CSS, GLOB_POSTCSS],
				languageOptions: {
					parser: parserPlain,
				},
				rules: {
					"oxfmt/oxfmt": ["error", oxfmtOptions],
				},
			},
			{
				name: "isentinel/oxfmt/scss",
				files: [GLOB_SCSS],
				languageOptions: {
					parser: parserPlain,
				},
				rules: {
					"oxfmt/oxfmt": ["error", oxfmtOptions],
				},
			},
			{
				name: "isentinel/oxfmt/less",
				files: [GLOB_LESS],
				languageOptions: {
					parser: parserPlain,
				},
				rules: {
					"oxfmt/oxfmt": ["error", oxfmtOptions],
				},
			},
		);
	}

	if (formattingOptions.html) {
		configs.push({
			name: "isentinel/oxfmt/html",
			files: ["**/*.html"],
			languageOptions: {
				parser: parserPlain,
			},
			rules: {
				"oxfmt/oxfmt": ["error", oxfmtOptions],
			},
		});
	}

	if (formattingOptions.markdown) {
		configs.push({
			name: "isentinel/oxfmt/markdown",
			files: [GLOB_MARKDOWN],
			rules: {
				"oxfmt/oxfmt": [
					"error",
					{
						...oxfmtOptions,
						...markdownOxfmtOptions(prettierOptions["jsdocPrintWidth"]),
					},
				],
			},
		});
	}

	if (formattingOptions.graphql) {
		configs.push({
			name: "isentinel/oxfmt/graphql",
			files: ["**/*.graphql"],
			languageOptions: {
				parser: parserPlain,
			},
			rules: {
				"oxfmt/oxfmt": ["error", oxfmtOptions],
			},
		});
	}

	if (formattingOptions.json) {
		configs.push({
			name: "isentinel/oxfmt/json",
			files: [GLOB_ALL_JSON],
			rules: {
				"oxfmt/oxfmt": ["error", oxfmtOptions],
			},
		});
	}

	if (formattingOptions.yaml) {
		configs.push({
			name: "isentinel/oxfmt/yaml",
			files: [GLOB_YAML],
			rules: {
				"oxfmt/oxfmt": [
					"error",
					{
						...oxfmtOptions,
						...YAML_OXFMT_OPTIONS,
					},
				],
			},
		});
	}

	return configs;
}

export { type OxfmtOptions } from "../../utils.ts";

export type { Options as PrettierOptions } from "prettier";
