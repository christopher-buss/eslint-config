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
	require,
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

	const jsFiles = prettierFiles ?? [
		GLOB_JS,
		GLOB_JSX,
		`${GLOB_MARKDOWN}/${GLOB_JS}`,
		`${GLOB_MARKDOWN}/${GLOB_JSX}`,
	];

	const tsFiles = prettierFiles ?? [
		GLOB_TS,
		GLOB_TSX,
		`${GLOB_MARKDOWN}/${GLOB_TS}`,
		`${GLOB_MARKDOWN}/${GLOB_TSX}`,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	configs.push(
		{
			files: jsFiles,
			name: "isentinel/prettier/javascript",
			rules: {
				...rules,
				"arrow-body-style": "off",
				"format/prettier": [
					"error",
					mergePrettierOptions(prettierOptions, {
						parser: "oxc",
						plugins: [require.resolve("@prettier/plugin-oxc")],
					}),
				],
				"prefer-arrow-callback": "off",
			},
		},
		{
			files: tsFiles,
			name: "isentinel/prettier",
			rules: {
				...rules,
				"arrow-body-style": "off",
				"format/prettier": [
					"error",
					mergePrettierOptions(prettierOptions, {
						parser: "oxc-ts",
						plugins: [require.resolve("@prettier/plugin-oxc")],
					}),
				],
				"prefer-arrow-callback": "off",
			},
		},
	);

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
						printWidth: Number(prettierOptions["jsdocPrintWidth"]) || 80,
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

export { type Options as PrettierOptions } from "prettier";
