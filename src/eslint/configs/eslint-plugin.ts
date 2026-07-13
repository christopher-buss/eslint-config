import { GLOB_SRC } from "../../globs.ts";
import { eslintPluginRules } from "../../rules/eslint-plugin.ts";
import { ensurePackages, interopDefault } from "../../utils.ts";
import type { OptionsFiles, OptionsOverrides, TypedFlatConfigItem } from "../types.ts";

export async function eslintPlugin({
	files = [GLOB_SRC],
	overrides = {},
}: OptionsFiles & OptionsOverrides = {}): Promise<Array<TypedFlatConfigItem>> {
	await ensurePackages(["eslint-plugin-eslint-plugin"]);

	const pluginEslintPlugin = await interopDefault(import("eslint-plugin-eslint-plugin"));

	return [
		{
			name: "isentinel/eslint-plugin/setup",
			plugins: {
				"eslint-plugin": pluginEslintPlugin,
			},
		},
		{
			name: "isentinel/eslint-plugin/rules",
			files,
			rules: {
				...eslintPluginRules(),

				...overrides,
			},
		},
	];
}
