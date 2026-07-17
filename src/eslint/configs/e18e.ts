import { GLOB_SRC } from "../../globs.ts";
import { e18eRules } from "../../rules/e18e.ts";
import { interopDefault } from "../../utils.ts";
import type {
	OptionsE18e,
	OptionsFiles,
	OptionsIsInEditor,
	OptionsProjectType,
	TypedFlatConfigItem,
} from "../types.ts";

export async function e18e({
	files = [GLOB_SRC],
	ignores,
	isInEditor = false,
	modernization = true,
	type = "game",
	moduleReplacements = type === "package" && isInEditor,
	overrides = {},
	performanceImprovements = true,
}: OptionsE18e &
	OptionsFiles &
	OptionsIsInEditor &
	OptionsProjectType & { ignores?: Array<string> } = {}): Promise<Array<TypedFlatConfigItem>> {
	const pluginE18e = await interopDefault(import("@e18e/eslint-plugin"));

	return [
		{
			name: "isentinel/e18e/rules",
			files,
			...(ignores ? { ignores } : {}),
			plugins: {
				e18e: pluginE18e,
			},
			rules: {
				...e18eRules({ modernization, moduleReplacements, performanceImprovements }),

				...overrides,
			},
		},
	];
}
