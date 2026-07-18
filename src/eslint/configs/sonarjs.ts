import { sonarjsRules } from "../../rules/sonarjs.ts";
import { interopDefault } from "../../utils.ts";
import type { OptionsHasRoblox, OptionsIsInEditor, TypedFlatConfigItem } from "../types.ts";

export async function sonarjs({
	isInEditor,
	roblox,
}: OptionsHasRoblox & Required<OptionsIsInEditor>): Promise<Array<TypedFlatConfigItem>> {
	const pluginSonar = await interopDefault(import("eslint-plugin-sonarjs"));

	return [
		{
			name: "isentinel/sonarjs",
			plugins: {
				sonar: pluginSonar,
			},
			rules: sonarjsRules({ isInEditor, roblox }),
		},
	];
}
