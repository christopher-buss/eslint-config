import { GLOB_SRC } from "../../globs.ts";
import { importsGameRules, importsRules } from "../../rules/imports.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type { OptionsProjectType, OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

export function imports({
	stylistic = true,
	type = "game",
}: OptionsProjectType & OptionsStylistic = {}): Array<TypedFlatConfigItem> {
	const pluginImport = lazyPlugin("eslint-plugin-import-lite");
	const pluginAntfu = lazyPlugin("eslint-plugin-antfu");

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
