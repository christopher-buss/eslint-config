import { GLOB_SRC } from "../../globs.ts";
import { importsGameRules, importsRules } from "../../rules/imports.ts";
import type { OptionsProjectType, OptionsStylistic } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintImports({
	stylistic = true,
	type = "game",
}: OptionsProjectType & OptionsStylistic = {}): Array<TypedOxlintConfigItem> {
	return [
		...createOxlintConfigs({
			name: "isentinel/imports",
			files: [GLOB_SRC],
			rules: importsRules({ stylistic }),
		}),
		...(type === "game"
			? createOxlintConfigs({
					name: "isentinel/imports/game",
					files: [`src/${GLOB_SRC}`],
					rules: importsGameRules(),
				})
			: []),
	];
}
