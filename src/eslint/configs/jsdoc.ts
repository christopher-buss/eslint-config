import { GLOB_SRC } from "../../globs.ts";
import { jsdocRules } from "../../rules/jsdoc.ts";
import { interopDefault } from "../../utils.ts";
import type {
	JsdocOptions,
	OptionsProjectType,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";

export async function jsdoc({
	full = false,
	stylistic = true,
	type = "game",
}: JsdocOptions & OptionsProjectType & OptionsStylistic = {}): Promise<Array<TypedFlatConfigItem>> {
	const pluginJsdoc = await interopDefault(import("eslint-plugin-jsdoc"));

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
