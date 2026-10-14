import { GLOB_SRC } from "../../globs.ts";
import { sonarjsRules } from "../../rules/sonarjs.ts";
import { interopDefault } from "../../utils.ts";
import type { OptionsHasRoblox, OptionsIsInEditor, TypedFlatConfigItem } from "../types.ts";

export async function sonarjs({
	complementIgnores,
	isInEditor,
	roblox,
}: OptionsHasRoblox &
	Required<OptionsIsInEditor> & {
		/**
		 * When set, re-apply the non-roblox rules to every source file except
		 * these globs (the roblox scope), so the complement is linted as
		 * standard-TS/Node land.
		 */
		complementIgnores?: Array<string>;
	}): Promise<Array<TypedFlatConfigItem>> {
	const pluginSonar = await interopDefault(import("eslint-plugin-sonarjs"));

	return [
		{
			name: "isentinel/sonarjs",
			plugins: {
				sonar: pluginSonar,
			},
			rules: sonarjsRules({ isInEditor, roblox }),
		},
		// The complement re-applies the non-roblox rules last, so it wins for
		// files outside the roblox scope.
		...(complementIgnores
			? [
					{
						name: "isentinel/sonarjs/complement",
						files: [GLOB_SRC],
						ignores: complementIgnores,
						rules: sonarjsRules({ isInEditor, roblox: false }),
					},
				]
			: []),
	];
}
