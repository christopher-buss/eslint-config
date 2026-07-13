import type { Linter } from "eslint";

import { GLOB_JS, GLOB_JSX, GLOB_MARKDOWN_CODE, GLOB_SRC, GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { arrowStyleRules, stylisticRules } from "../../rules/stylistic.ts";
import { interopDefault } from "../../utils.ts";
import type { StylisticConfig, TypedFlatConfigItem } from "../types.ts";
import type { PrettierOptions } from "./oxfmt.ts";

export const StylisticConfigDefaults: StylisticConfig = {
	indent: "tab",
	jsx: true,
	quotes: "double",
	semi: true,
};

export async function stylistic(
	options: StylisticConfig = {},
	prettierOptions: PrettierOptions = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { arrowLength, indent, jsx, quotes, semi } = {
		...StylisticConfigDefaults,
		...options,
	};

	const [pluginArrowReturnStyle, pluginStylistic, pluginAntfu] = await Promise.all([
		interopDefault(import("eslint-plugin-arrow-return-style-x")),
		interopDefault(import("@stylistic/eslint-plugin")),
		interopDefault(import("eslint-plugin-antfu")),
	]);

	const config = pluginStylistic.configs.customize({
		indent,
		jsx,
		pluginName: "style",
		quotes,
		semi,
	});

	function createArrowStyleRule(_: string, maxLength?: number): Linter.RulesRecord {
		return arrowStyleRules({
			arrowLength,
			maxLength,
			printWidth:
				typeof prettierOptions.printWidth === "number"
					? prettierOptions.printWidth
					: undefined,
			usePrettier: prettierOptions,
		}) as Linter.RulesRecord;
	}

	return [
		{
			name: "isentinel/stylistic/setup",
			plugins: {
				"antfu": pluginAntfu,
				"arrow-style": pluginArrowReturnStyle,
				"style": pluginStylistic,
			},
		},
		{
			name: "isentinel/stylistic",
			files: [GLOB_SRC],
			rules: {
				...config.rules,

				...stylisticRules({ indent, jsx, quotes, semi }),
			},
		},
		{
			name: "isentinel/stylistic/ts",
			files: [GLOB_TS, GLOB_TSX],
			rules: {
				...createArrowStyleRule("oxc-ts"),
			},
		},
		{
			name: "isentinel/stylistic/js",
			files: [GLOB_JS, GLOB_JSX],
			rules: {
				...createArrowStyleRule("oxc"),
			},
		},
		{
			name: "isentinel/stylistic/markdown-code",
			files: [GLOB_MARKDOWN_CODE],
			rules: {
				...createArrowStyleRule("oxc", Number(prettierOptions["jsdocPrintWidth"]) || 80),
			},
		},
	];
}
