import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Plugin as OxlintPlugin } from "@oxlint/plugins";

import { GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { smallRulesRules } from "../../rules/small-rules.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsIsInEditor,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";

/**
 * Register the Oxlint-native `@pobammer-ts/small-rules` plugin, adapted for
 * ESLint. `eslintCompatPlugin` generates an ESLint `create` for the plugin's
 * `createOnce` rules (`prefer-singular-enums`); it runs once, when the lazy
 * plugin hydrates, and the memoised object is shared by every registration.
 *
 * @returns The ESLint-compatible small-rules plugin.
 */
export function loadSmallRulesPlugin(): NonNullable<TypedFlatConfigItem["plugins"]>[string] {
	return lazyPlugin("@pobammer-ts/small-rules", (plugin) => {
		// `@pobammer-ts/small-rules` ships its own `oxlint-plugin-utilities`
		// Plugin type that is structurally an oxlint/ESLint plugin but not
		// nominally assignable to `@oxlint/plugins`' Plugin;
		// `eslintCompatPlugin` adapts it at runtime.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- cross-package plugin-type mismatch, runtime-compatible
		return eslintCompatPlugin(plugin as OxlintPlugin);
	});
}

export function smallRules(
	options: OptionsComponentExtensions & OptionsFiles & OptionsIsInEditor & OptionsStylistic = {},
): Array<TypedFlatConfigItem> {
	const {
		componentExts: componentExtensions = [],
		isInEditor = false,
		stylistic = true,
	} = options;

	const pluginSmallRules = loadSmallRulesPlugin();

	const files = options.files ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	return [
		{
			name: "isentinel/small-rules/setup",
			plugins: {
				"small-rules": pluginSmallRules,
			},
		},
		{
			name: "isentinel/small-rules",
			files,
			plugins: {
				"small-rules": pluginSmallRules,
			},
			rules: smallRulesRules({ isInEditor, stylistic }),
		},
	];
}
