import type PluginStylistic from "@stylistic/eslint-plugin";

import { GLOB_SRC } from "../../globs.ts";
import { stylisticRules } from "../../rules/stylistic.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type { StylisticConfig, TypedFlatConfigItem } from "../types.ts";

export const StylisticConfigDefaults: StylisticConfig = {
	indent: "tab",
	jsx: true,
	quotes: "double",
	semi: true,
};

export function stylistic(options: StylisticConfig = {}): Array<TypedFlatConfigItem> {
	const { indent, jsx, quotes, semi } = {
		...StylisticConfigDefaults,
		...options,
	};

	const pluginAntfu = lazyPlugin("eslint-plugin-antfu");
	// Hydrates immediately on the next line; the laziness is for the callers
	// that only register `style` (`comments`, `react`) on a run with
	// `stylistic: false`, where this module is never composed.
	const pluginStylistic = lazyPlugin<typeof PluginStylistic>("@stylistic/eslint-plugin");

	const config = pluginStylistic.configs.customize({
		indent,
		jsx,
		pluginName: "style",
		quotes,
		semi,
	});

	return [
		{
			name: "isentinel/stylistic/setup",
			plugins: {
				antfu: pluginAntfu,
				style: pluginStylistic,
			},
		},
		{
			name: "isentinel/stylistic",
			files: [GLOB_SRC],
			rules: {
				...config.rules,

				...stylisticRules({ indent, jsx, quotes, semi }),
			},
		},
	];
}
