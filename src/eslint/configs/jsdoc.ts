import { GLOB_SRC } from "../../globs.ts";
import { jsdocRules } from "../../rules/jsdoc.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type {
	JsdocOptions,
	OptionsProjectType,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";

export function jsdoc({
	full = false,
	stylistic = true,
	type = "game",
}: JsdocOptions & OptionsProjectType & OptionsStylistic = {}): Array<TypedFlatConfigItem> {
	const pluginJsdoc = lazyPlugin("eslint-plugin-jsdoc");

	return [
		{
			name: "isentinel/jsdoc/setup",
			plugins: {
				jsdoc: pluginJsdoc,
			},
		},
		{
			name: "isentinel/jsdoc",
			files: [GLOB_SRC],
			rules: jsdocRules({ full, stylistic, type }),
		},
	];
}
