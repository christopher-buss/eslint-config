import type { Options as PrettierOptions } from "prettier";

import { defaultPluginRenaming } from "../factory";
import {
	GLOB_ALL_JSON,
	GLOB_CSS,
	GLOB_LESS,
	GLOB_MARKDOWN,
	GLOB_MARKDOWN_CODE,
	GLOB_POSTCSS,
	GLOB_SCSS,
	GLOB_SRC,
	GLOB_YAML,
} from "../globs";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsFormatters,
	OptionsOverrides,
	OptionsTypeScriptParserOptions,
	StylisticConfig,
	TypedFlatConfigItem,
} from "../types";
import { interopDefault, parserPlain, renameRules, resolveWithDefaults } from "../utils";

export type PrettierRuleOptions = Pick<Partial<PrettierOptions>, "parser"> &
	PrettierOptions &
	Record<string, undefined | unknown>;

export async function prettier(
	options?: OptionsComponentExtensions &
		OptionsFiles &
		OptionsOverrides &
		OptionsTypeScriptParserOptions & {
			formatters?: OptionsFormatters | true;
			prettierOptions?: PrettierOptions;
			stylistic?: StylisticConfig;
		},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		files: prettierFiles,
		formatters = {},
		prettierOptions = {},
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

	const [configPrettier, pluginPrettier] = await Promise.all([
		interopDefault(import("eslint-config-prettier/flat")),
		interopDefault(import("eslint-plugin-prettier")),
	]);

	const rulesToIgnore = ["curly", "style/quotes"];
	const rules = renameRules(configPrettier.rules, defaultPluginRenaming);
	for (const rule of rulesToIgnore) {
		delete rules[rule];
	}

	const configs: Array<TypedFlatConfigItem> = [
		{
			name: "isentinel/prettier/setup",
			plugins: {
				format: pluginPrettier,
			},
		},
	];

	const tsFiles = prettierFiles ?? [
		GLOB_SRC,
		GLOB_MARKDOWN_CODE,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	configs.push({
		files: tsFiles,
		name: "isentinel/prettier",
		rules: {
			...rules,
			"arrow-body-style": "off",
			"format/prettier": [
				"error",
				mergePrettierOptions(prettierOptions, {
					parser: "typescript",
				}),
			],
			"prefer-arrow-callback": "off",
		},
	});

	if (formattingOptions.css) {
		configs.push(
			{
				files: [GLOB_CSS, GLOB_POSTCSS],
				languageOptions: {
					parser: parserPlain,
				},
				name: "isentinel/prettier/css",
				rules: {
					"format/prettier": [
						"error",
						mergePrettierOptions(prettierOptions, {
							parser: "css",
						}),
					],
				},
			},
			{
				files: [GLOB_SCSS],
				languageOptions: {
					parser: parserPlain,
				},
				name: "isentinel/prettier/scss",
				rules: {
					"format/prettier": [
						"error",
						mergePrettierOptions(prettierOptions, {
							parser: "scss",
						}),
					],
				},
			},
			{
				files: [GLOB_LESS],
				languageOptions: {
					parser: parserPlain,
				},
				name: "isentinel/prettier/less",
				rules: {
					"format/prettier": [
						"error",
						mergePrettierOptions(prettierOptions, {
							parser: "less",
						}),
					],
				},
			},
		);
	}

	if (formattingOptions.html) {
		configs.push({
			files: ["**/*.html"],
			languageOptions: {
				parser: parserPlain,
			},
			name: "isentinel/prettier/html",
			rules: {
				"format/prettier": [
					"error",
					mergePrettierOptions(prettierOptions, {
						parser: "html",
					}),
				],
			},
		});
	}

	if (formattingOptions.markdown) {
		configs.push({
			files: [GLOB_MARKDOWN],
			name: "isentinel/prettier/markdown",
			rules: {
				"format/prettier": [
					"error",
					mergePrettierOptions(prettierOptions, {
						embeddedLanguageFormatting: "auto",
						parser: "markdown",
						printWidth: 80,
						proseWrap: "always",
					}),
				],
			},
		});
	}

	if (formattingOptions.graphql) {
		configs.push({
			files: ["**/*.graphql"],
			languageOptions: {
				parser: parserPlain,
			},
			name: "isentinel/prettier/graphql",
			rules: {
				"format/prettier": [
					"error",
					mergePrettierOptions(prettierOptions, {
						parser: "graphql",
					}),
				],
			},
		});
	}

	if (formattingOptions.json) {
		configs.push({
			files: [GLOB_ALL_JSON],
			name: "isentinel/prettier/json",
			rules: {
				"format/prettier": [
					"error",
					mergePrettierOptions(prettierOptions, {
						parser: "json",
					}),
				],
			},
		});
	}

	if (formattingOptions.yaml) {
		configs.push({
			files: [GLOB_YAML],
			name: "isentinel/prettier/yaml",
			rules: {
				"format/prettier": [
					"error",
					mergePrettierOptions(prettierOptions, {
						parser: "yaml",
						tabWidth: 2,
						useTabs: false,
					}),
				],
			},
		});
	}

	return configs;
}

function mergePrettierOptions(
	options: PrettierOptions,
	overrides: PrettierRuleOptions = {},
): Record<string, any> {
	return {
		...options,
		...overrides,
		plugins: [...(overrides.plugins || []), ...(options.plugins || [])],
	};
}

export { type Options as PrettierOptions } from "prettier";
