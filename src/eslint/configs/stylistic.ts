import type PluginStylistic from "@stylistic/eslint-plugin";

import { GLOB_JSX, GLOB_SRC, GLOB_TSX } from "../../globs.ts";
import { stylisticJsxRules, stylisticRules } from "../../rules/stylistic.ts";
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

	const presetRules = Object.entries(config.rules ?? {});

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
				...Object.fromEntries(presetRules.filter((entry) => !isJsxRule(entry))),

				...stylisticRules({ indent, jsx, quotes, semi }),
			},
		},
		...(jsx === false
			? []
			: [
					{
						name: "isentinel/stylistic/jsx",
						files: [GLOB_JSX, GLOB_TSX],
						rules: {
							...Object.fromEntries(presetRules.filter(isJsxRule)),

							...stylisticJsxRules({ jsx }),
						},
					},
				]),
	];
}

/**
 * The preset's `style/jsx-*` rules only report on JSX, which a `.ts` or `.js`
 * file cannot contain, so they go to their own JSX/TSX-scoped block.
 * @param root0
 */
function isJsxRule([name]: [string, unknown]): boolean {
	return name.startsWith("style/jsx-");
}
