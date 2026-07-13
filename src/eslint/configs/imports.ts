import { GLOB_SRC } from "../../globs.ts";
import { importsGameRules, importsRules } from "../../rules/imports.ts";
import { interopDefault } from "../../utils.ts";
import type { OptionsProjectType, OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

export async function imports({
	stylistic = true,
	type = "game",
}: OptionsProjectType & OptionsStylistic = {}): Promise<Array<TypedFlatConfigItem>> {
	const [pluginImport, pluginAntfu] = await Promise.all([
		interopDefault(import("eslint-plugin-import-lite")),
		interopDefault(import("eslint-plugin-antfu")),
	]);

	return [
		{
			name: "isentinel/imports/rules",
			plugins: {
				antfu: pluginAntfu,
				import: pluginImport,
			},
			rules: importsRules({ stylistic }),
		},
		...(type === "game"
			? [
					{
						name: "isentinel/imports/game",
						files: [`src/${GLOB_SRC}`],
						rules: importsGameRules(),
					},
				]
			: []),
	];
}
