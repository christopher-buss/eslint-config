import type {
	OptionsE18e,
	OptionsIsInEditor,
	OptionsProjectType,
	TypedFlatConfigItem,
} from "../types.ts";
import { interopDefault } from "../utils.ts";

export async function e18e({
	isInEditor = false,
	modernization = true,
	type = "game",
	moduleReplacements = type === "package" && isInEditor,
	overrides = {},
	performanceImprovements = true,
}: OptionsE18e & OptionsIsInEditor & OptionsProjectType = {}): Promise<Array<TypedFlatConfigItem>> {
	const pluginE18e = await interopDefault(import("@e18e/eslint-plugin"));

	const { configs } = pluginE18e;

	return [
		{
			name: "isentinel/e18e/rules",
			plugins: {
				e18e: pluginE18e,
			},
			rules: {
				...(modernization ? { ...configs.modernization.rules } : {}),
				...(moduleReplacements ? { ...configs.moduleReplacements.rules } : {}),
				...(performanceImprovements ? { ...configs.performanceImprovements.rules } : {}),

				...overrides,
			},
		},
	];
}
