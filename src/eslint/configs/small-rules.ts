import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Plugin as OxlintPlugin } from "@oxlint/plugins";

import { GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { smallRulesRules } from "../../rules/small-rules.ts";
import { interopDefault } from "../../utils.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsIsInEditor,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";

/**
 * Load the Oxlint-native `@pobammer-ts/small-rules` plugin and adapt it for
 * ESLint. `eslintCompatPlugin` generates an ESLint `create` for the plugin's
 * `createOnce` rules (`prefer-singular-enums`); it mutates the module in place
 * and is idempotent, so the shared plugin object works under both linters
 * wherever it is registered.
 *
 * @returns The ESLint-compatible small-rules plugin.
 */
export async function loadSmallRulesPlugin(): Promise<
	NonNullable<TypedFlatConfigItem["plugins"]>[string]
> {
	// `@pobammer-ts/small-rules` ships its own `oxlint-plugin-utilities` Plugin
	// type that is structurally an oxlint/ESLint plugin but not nominally
	// assignable to `@oxlint/plugins`' Plugin; `eslintCompatPlugin` adapts it at
	// runtime.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- cross-package plugin-type mismatch, runtime-compatible
	const plugin = (await interopDefault(
		import("@pobammer-ts/small-rules"),
	)) as unknown as OxlintPlugin;
	return eslintCompatPlugin(plugin);
}

export async function smallRules(
	options: OptionsComponentExtensions & OptionsFiles & OptionsIsInEditor & OptionsStylistic = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		isInEditor = false,
		stylistic = true,
	} = options;

	const pluginSmallRules = await loadSmallRulesPlugin();

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
