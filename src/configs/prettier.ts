import { createRequire } from "module";
import type { Options as PrettierOptions } from "prettier";

import { defaultPluginRenaming } from "../factory";
import {
	GLOB_ALL_JSON,
	GLOB_CSS,
	GLOB_LESS,
	GLOB_MARKDOWN,
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
import { interopDefault, parserPlain, renameRules } from "../utils";

const require = createRequire(import.meta.url);

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
		prettierOptions,
	} = options ?? {};

	const formattingOptions = {
		css: true,
		graphql: true,
		html: true,
		json: true,
		markdown: true,
		yaml: true,
		...(formatters === true ? {} : formatters),
	} satisfies OptionsFormatters;

	const [configPrettier, pluginPrettier] = await Promise.all([
		interopDefault(import("eslint-config-prettier/flat")),
		interopDefault(import("eslint-plugin-prettier")),
	]);

	const basePrettierOptions: PrettierOptions = Object.assign(
		{
			arrowParens: "always",
			jsdocPreferCodeFences: true,
			jsdocPrintWidth: 80,
			plugins: [require.resolve("prettier-plugin-jsdoc")],
			printWidth: 100,
			quoteProps: "consistent",
			semi: true,
			singleQuote: false,
			tabWidth: 4,
			trailingComma: "all",
			tsdoc: true,
			useTabs: true,
		} satisfies PrettierOptions,
		prettierOptions ?? {},
	);

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
				mergePrettierOptions(basePrettierOptions, {
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
						mergePrettierOptions(basePrettierOptions, {
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
						mergePrettierOptions(basePrettierOptions, {
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
						mergePrettierOptions(basePrettierOptions, {
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
					mergePrettierOptions(basePrettierOptions, {
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
					mergePrettierOptions(basePrettierOptions, {
						embeddedLanguageFormatting: "off",
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
					mergePrettierOptions(basePrettierOptions, {
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
					mergePrettierOptions(basePrettierOptions, {
						parser: "json",
					}),
				],
			},
		});
	}

	// YAML formatting - uses context-dependent quoting (unquoted → single → double quotes)
	if (formattingOptions.yaml) {
		configs.push({
			files: [GLOB_YAML],
			name: "isentinel/prettier/yaml",
			rules: {
				"format/prettier": [
					"error",
					mergePrettierOptions(basePrettierOptions, {
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
