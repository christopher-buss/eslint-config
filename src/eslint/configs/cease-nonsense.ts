import { GLOB_MARKDOWN, GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { getTsConfig, interopDefault } from "../../utils.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsIsInEditor,
	OptionsOverridesTypeAware,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types.ts";

export async function ceaseNonsense(
	options: OptionsComponentExtensions &
		OptionsFiles &
		OptionsIsInEditor &
		OptionsOverridesTypeAware &
		OptionsStylistic &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		isInEditor = false,
		overridesTypeAware = {},
		stylistic = true,
		typeAware = true,
	} = options;

	const pluginCeaseNonsense = await interopDefault(
		import("@pobammer-ts/eslint-cease-nonsense-rules"),
	);

	const files = options.files ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	const filesTypeAware = options.filesTypeAware ?? [GLOB_TS, GLOB_TSX];
	const ignoresTypeAware = options.ignoresTypeAware ?? [`${GLOB_MARKDOWN}/**`];
	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	const typeAwareRules: TypedFlatConfigItem["rules"] = {
		"cease-nonsense/prefer-read-only-props": "error",
	};

	return [
		{
			name: "isentinel/cease-nonsense/setup",
			plugins: {
				"cease-nonsense": pluginCeaseNonsense,
			},
		},
		{
			name: "isentinel/cease-nonsense",
			files,
			plugins: {
				"cease-nonsense": pluginCeaseNonsense,
			},
			rules: {
				"cease-nonsense/no-commented-code": isInEditor ? "off" : "error",
				"cease-nonsense/prefer-class-properties": "error",
				"cease-nonsense/prefer-early-return": ["error", { maximumStatements: 1 }],
				"cease-nonsense/strict-component-boundaries": "error",

				...(stylistic !== false
					? {
							"cease-nonsense/prefer-module-scope-constants": "error",
							"cease-nonsense/prefer-singular-enums": "error",
						}
					: {}),
			},
		},
		...(isTypeAware
			? [
					{
						name: "isentinel/typescript/rules-type-aware",
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
