import type { Options as PrettierOptions } from "prettier";

import { defaultPluginRenaming } from "../factory";
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
} from "../globs";
import type {
	FormatterEngine,
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsFormatters,
	OptionsOverrides,
	OptionsTypeScriptParserOptions,
	StylisticConfig,
	TypedFlatConfigItem,
} from "../types";
import {
	interopDefault,
	mergePrettierOptions,
	parserPlain,
	renameRules,
	resolveWithDefaults,
} from "../utils";

export type PrettierRuleOptions = Pick<Partial<PrettierOptions>, "parser"> &
	PrettierOptions &
	Record<string, unknown>;

export async function prettier(
	options?: OptionsComponentExtensions &
		OptionsFiles &
		OptionsOverrides &
		OptionsTypeScriptParserOptions & {
			formatters?: OptionsFormatters | true;
			jsFormatter?: FormatterEngine;
			prettierOptions?: PrettierOptions;
			stylistic?: StylisticConfig;
			tsFormatter?: FormatterEngine;
		},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		files: prettierFiles,
		formatters = {},
		jsFormatter = "oxfmt",
		prettierOptions = {},
		tsFormatter = "oxfmt",
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

	if (jsFormatter === "prettier") {
		const jsFiles = prettierFiles ?? [
			GLOB_JS,
			GLOB_JSX,
			`${GLOB_MARKDOWN}/${GLOB_JS}`,
			`${GLOB_MARKDOWN}/${GLOB_JSX}`,
		];

		configs.push({
			name: "isentinel/prettier/javascript",
			files: jsFiles,
			rules: {
				...rules,
				"arrow-body-style": "off",
				"format/prettier": [
					"error",
					mergePrettierOptions(prettierOptions, {
						// parser: "oxc",
						// plugins: [require.resolve("@prettier/plugin-oxc")],
					}),
				],
				"prefer-arrow-callback": "off",
			},
		});
	}

	if (tsFormatter === "prettier") {
		const tsFiles = prettierFiles ?? [
			GLOB_TS,
			GLOB_TSX,
			`${GLOB_MARKDOWN}/${GLOB_TS}`,
			`${GLOB_MARKDOWN}/${GLOB_TSX}`,
			...componentExtensions.map((extension) => `**/*.${extension}`),
		];

		configs.push({
			name: "isentinel/prettier/typescript",
			files: tsFiles,
			rules: {
				...rules,
				"arrow-body-style": "off",
				"format/prettier": [
					"error",
					mergePrettierOptions(prettierOptions, {
						// @see https://github.com/hosseinmd/prettier-plugin-jsdoc/issues/249
						// parser: "oxc-ts",
						// plugins: [require.resolve("@prettier/plugin-oxc")],
					}),
				],
				"prefer-arrow-callback": "off",
			},
		});
	}

	if (formattingOptions.css) {
		configs.push(
			{
				name: "isentinel/prettier/css",
				files: [GLOB_CSS, GLOB_POSTCSS],
				languageOptions: {
					parser: parserPlain,
				},
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
				name: "isentinel/prettier/scss",
				files: [GLOB_SCSS],
				languageOptions: {
					parser: parserPlain,
				},
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
				name: "isentinel/prettier/less",
				files: [GLOB_LESS],
				languageOptions: {
					parser: parserPlain,
				},
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
			name: "isentinel/prettier/html",
			files: ["**/*.html"],
			languageOptions: {
				parser: parserPlain,
			},
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
			name: "isentinel/prettier/markdown",
			files: [GLOB_MARKDOWN],
			rules: {
				"format/prettier": [
					"error",
					mergePrettierOptions(prettierOptions, {
						embeddedLanguageFormatting: "auto",
						parser: "markdown",
						printWidth: Number(prettierOptions["jsdocPrintWidth"]) || 80,
						proseWrap: "always",
					}),
				],
			},
		});
	}

	if (formattingOptions.graphql) {
		configs.push({
			name: "isentinel/prettier/graphql",
			files: ["**/*.graphql"],
			languageOptions: {
				parser: parserPlain,
			},
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
			name: "isentinel/prettier/json",
			files: [GLOB_ALL_JSON],
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
			name: "isentinel/prettier/yaml",
			files: [GLOB_YAML],
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

export { type Options as PrettierOptions } from "prettier";
