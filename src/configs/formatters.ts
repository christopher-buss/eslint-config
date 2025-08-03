import type { Options as PrettierOptions } from "prettier";

import { GLOB_CSS, GLOB_LESS, GLOB_MARKDOWN, GLOB_POSTCSS, GLOB_SCSS } from "../globs";
import type { OptionsFormatters, StylisticConfig, TypedFlatConfigItem } from "../types";
import { interopDefault, parserPlain } from "../utils";
import { StylisticConfigDefaults } from "./stylistic";

export type PrettierRuleOptions = Pick<Partial<PrettierOptions>, "parser"> &
	PrettierOptions &
	Record<string, undefined | unknown>;

export async function formatters(
	options: OptionsFormatters | true = {},
	stylistic: StylisticConfig = {},
	markdownEnabled = true,
): Promise<Array<TypedFlatConfigItem>> {
	let formattingOptions = options;
	if (formattingOptions === true) {
		formattingOptions = {
			css: true,
			graphql: true,
			html: true,
			markdown: true,
		};
	}

	const { indent, quotes, semi } = {
		...StylisticConfigDefaults,
		...stylistic,
	};

	const prettierOptions: PrettierOptions = Object.assign(
		{
			semi,
			singleQuote: quotes === "single",
			tabWidth: typeof indent === "number" ? indent : 2,
			trailingComma: "all",
			useTabs: indent === "tab",
		} satisfies PrettierOptions,
		formattingOptions.prettierOptions ?? {},
	);

	const dprintOptions = Object.assign(
		{
			indentWidth: typeof indent === "number" ? indent : 2,
			quoteStyle: quotes === "single" ? "preferSingle" : "preferDouble",
			useTabs: indent === "tab",
		},
		formattingOptions.dprintOptions ?? {},
	);

	const pluginFormat = await interopDefault(import("eslint-plugin-format"));

	const configs: Array<TypedFlatConfigItem> = [
		{
			name: "isentinel/formatters/setup",
			plugins: {
				format: pluginFormat,
			},
		},
	];

	if (formattingOptions.css) {
		configs.push(
			{
				files: [GLOB_CSS, GLOB_POSTCSS],
				languageOptions: {
					parser: parserPlain,
				},
				name: "isentinel/formatter/css",
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
				name: "isentinel/formatter/scss",
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
				name: "isentinel/formatter/less",
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
			name: "isentinel/formatter/html",
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
		const formatter =
			formattingOptions.markdown === true ? "prettier" : formattingOptions.markdown;

		configs.push({
			files: markdownEnabled ? ["**/*.__markdown_content__"] : [GLOB_MARKDOWN],
			languageOptions: {
				parser: parserPlain,
			},
			name: "isentinel/formatter/markdown",
			rules: {
				[`format/${formatter}`]: [
					"error",
					formatter === "prettier"
						? mergePrettierOptions(prettierOptions, {
								embeddedLanguageFormatting: "off",
								parser: "markdown",
							})
						: {
								...dprintOptions,
								language: "markdown",
							},
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
			name: "isentinel/formatter/graphql",
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
