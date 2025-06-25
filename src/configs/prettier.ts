import { createRequire } from "module";
import type { Options as PrettierOptions } from "prettier";

import { defaultPluginRenaming, GLOB_SRC, interopDefault, renameRules } from "..";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsOverrides,
	OptionsTypeScriptParserOptions,
	TypedFlatConfigItem,
} from "../types";

const require = createRequire(import.meta.url);

export async function prettier(
	options?: OptionsComponentExtensions &
		OptionsFiles &
		OptionsOverrides &
		OptionsTypeScriptParserOptions & { prettierOptions?: PrettierOptions },
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		files: prettierFiles,
		prettierOptions,
	} = options ?? {};

	const files = prettierFiles ?? [
		GLOB_SRC,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	const [configPrettier, pluginFormat] = await Promise.all([
		interopDefault(import("eslint-config-prettier/flat")),
		interopDefault(import("eslint-plugin-format")),
	]);

	const defaultPrettierOptions = {
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
		...prettierOptions,
	} satisfies PrettierOptions;

	const rulesToIgnore = ["curly", "style/quotes"];

	const rules = renameRules(configPrettier.rules, defaultPluginRenaming);
	for (const rule of rulesToIgnore) {
		delete rules[rule];
	}

	return [
		{
			files,
			name: "style/prettier",
			plugins: {
				format: pluginFormat,
			},
			rules: {
				...rules,
				"arrow-body-style": "off",
				"format/prettier": [
					"error",
					{
						...defaultPrettierOptions,
						parser: "typescript",
					},
				],
				"prefer-arrow-callback": "off",
			},
		},
	];
}
