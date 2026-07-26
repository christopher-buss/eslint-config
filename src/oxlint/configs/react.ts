import { GLOB_JSX, GLOB_TSX } from "../../globs.ts";
import type { ReactRuleOptions } from "../../rules/react.ts";
import { reactRules } from "../../rules/react.ts";
import type { OptionsFiles, OptionsHasRoblox, OptionsOverrides } from "../../types.ts";
import type { OxlintRules, TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

/**
 * React configs for oxlint: the shared react family plus oxlint's native
 * `react-perf/*` rules, which have no ESLint counterpart here and so only run
 * under oxlint.
 *
 * The perf rules are emitted as a raw fragment (`plugins: ["react-perf"]` with
 * literal rule names) rather than through `createOxlintConfigs`, since the
 * canonical-name translation layer only knows rules that exist on the ESLint
 * side, and the raw form keeps the `nativeAllowList` option typed by
 * `OxlintRules`.
 *
 * Unlike `oxlintOxc`, the roblox flag is not split across a complement overlay:
 * `nativeAllowList` is a noise knob rather than a correctness one, so the extra
 * overrides would buy nothing.
 *
 * @param options - Shared rule options.
 * @returns The react config fragments.
 */
export function oxlintReact(
	options: OptionsFiles &
		OptionsHasRoblox &
		OptionsOverrides &
		ReactRuleOptions & { importSource?: string } = {},
): Array<TypedOxlintConfigItem> {
	const {
		filenameCase = "kebabCase",
		importSource,
		overrides = {},
		reactCompiler = true,
		roblox = true,
		stylistic = true,
	} = options;

	const files = options.files?.flat() ?? [GLOB_JSX, GLOB_TSX];

	const performanceRule: NonNullable<OxlintRules["react-perf/jsx-no-jsx-as-prop"]> = roblox
		? ["error", { nativeAllowList: "all" }]
		: "error";

	return [
		...createOxlintConfigs({
			name: "isentinel/react",
			files,
			overrides,
			rules: reactRules({ filenameCase, reactCompiler, stylistic }),
			settings: {
				"react-x": {
					importSource: importSource ?? "@rbxts",
					version: "17.0.2",
				},
			},
		}),
		{
			name: "isentinel/react/perf",
			files,
			plugins: ["react-perf"],
			rules: {
				"react-perf/jsx-no-jsx-as-prop": performanceRule,
				"react-perf/jsx-no-new-array-as-prop": performanceRule,
				"react-perf/jsx-no-new-function-as-prop": performanceRule,
				"react-perf/jsx-no-new-object-as-prop": performanceRule,
			} satisfies OxlintRules,
		},
	];
}
