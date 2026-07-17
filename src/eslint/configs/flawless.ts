import { GLOB_DTS, GLOB_MARKDOWN, GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { flawlessRules } from "../../rules/flawless.ts";
import { getTsConfig, interopDefault } from "../../utils.ts";
import type {
	OptionsOverridesTypeAware,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types.ts";

export async function flawless(
	options: OptionsOverridesTypeAware &
		OptionsStylistic &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { overridesTypeAware = {}, stylistic = true, typeAware = true } = options;

	const eslintPluginFlawless = await interopDefault(import("eslint-plugin-flawless"));

	const filesTypeAware = [GLOB_TS, GLOB_TSX];
	const ignoresTypeAware = options.ignoresTypeAware ?? [`${GLOB_MARKDOWN}/**`, GLOB_DTS];
	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	const typeAwareRules: TypedFlatConfigItem["rules"] = {
		"flawless/prefer-read-only-props": "error",
	};

	return [
		{
			name: "isentinel/flawless/setup",
			plugins: {
				flawless: eslintPluginFlawless,
			},
		},
		{
			name: "isentinel/flawless/rules",
			files: [GLOB_TS],
			rules: flawlessRules({ stylistic }),
		},
		...(isTypeAware
			? [
					{
						name: "isentinel/flawless/rules-type-aware",
						files: filesTypeAware,
						ignores: ignoresTypeAware,
						rules: {
							...typeAwareRules,
							...overridesTypeAware,
						},
					},
				]
			: []),
	];
}
