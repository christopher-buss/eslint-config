import { GLOB_JSX, GLOB_SRC, GLOB_TSX } from "../../globs.ts";
import {
	perfectionistJsxRules,
	perfectionistRules,
	perfectionistSettings,
} from "../../rules/perfectionist.ts";
import { interopDefault } from "../../utils.ts";
import type { OptionsProjectType, PerfectionistConfig, TypedFlatConfigItem } from "../types.ts";

/**
 * Perfectionist plugin for props and items sorting.
 *
 * @param config - An optional configuration object for the plugin.
 * @returns The configuration.
 * @see https://github.com/azat-io/eslint-plugin-perfectionist
 */
export async function perfectionist(
	config?: OptionsProjectType & PerfectionistConfig,
): Promise<Array<TypedFlatConfigItem>> {
	const pluginPerfectionist = await interopDefault(import("eslint-plugin-perfectionist"));

	return [
		{
			name: "isentinel/perfectionist/setup",
			plugins: {
				perfectionist: pluginPerfectionist,
			},
		},
		{
			name: "isentinel/perfectionist",
			files: [GLOB_SRC],
			rules: perfectionistRules(config),
			settings: { ...perfectionistSettings },
		},
		{
			name: "isentinel/perfectionist/jsx",
			files: [GLOB_JSX, GLOB_TSX],
			rules: perfectionistJsxRules(config),
		},
	];
}
