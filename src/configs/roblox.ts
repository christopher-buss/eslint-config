import { GLOB_LUA, GLOB_MARKDOWN } from "../globs";
import type {
	OptionsComponentExtensions,
	OptionsFilesTypeAware,
	OptionsOverridesTypeAware,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types";
import { createTsParser, getTsConfig, interopDefault, parserPlain } from "../utils";

export async function roblox(
	options: OptionsComponentExtensions &
		OptionsFilesTypeAware &
		OptionsOverridesTypeAware &
		OptionsStylistic &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes = {},
	formatLua = true,
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		overrides = {},
		overridesTypeAware = {},
		parserOptions = {},
		stylistic = true,
		typeAware = true,
	} = options;

	const [parserTs, pluginRobloxTs, pluginSentinel, pluginCeaseNonsense] = await Promise.all([
		interopDefault(import("@typescript-eslint/parser")),
		interopDefault(import("eslint-plugin-roblox-ts")),
		interopDefault(import("eslint-plugin-sentinel")),
		interopDefault(import("@pobammer-ts/eslint-cease-nonsense-rules")),
	] as const);

	const files = options.files ?? [
		"**/*/*.?([cm])ts",
		"**/*/*.?([cm])tsx",
		...componentExtensions.map((extension) => `**/*/*.${extension}`),
	];

	const filesTypeAware = options.filesTypeAware ?? ["**/*/*.?([cm])ts", "**/*/*.?([cm])tsx"];
	const ignoresTypeAware = options.ignoresTypeAware ?? [`${GLOB_MARKDOWN}/**`];
	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	function makeParser(
		usesTypeInformation: boolean,
		parserFiles: Array<Array<string> | string>,
		ignores?: Array<string>,
	): TypedFlatConfigItem {
		return createTsParser({
			componentExtensions,
			configName: "roblox",
			files: parserFiles,
			ignores,
			parser: parserTs,
			parserOptions,
			tsconfigPath,
			typeAware: usesTypeInformation,
		});
	}

	const typeAwareRules: TypedFlatConfigItem["rules"] = {
		"roblox/lua-truthiness": "warn",
		"roblox/misleading-lua-tuple-checks": "error",
		"roblox/no-array-pairs": "warn",
		"roblox/no-object-math": "error",
		"roblox/no-post-fix-new": "error",
		"roblox/no-preceding-spread-element": "error",
		"roblox/no-undeclared-scope": "error",
		"roblox/size-method": "error",
		"sentinel/explicit-size-check": "error",
	};

	const configs: Array<TypedFlatConfigItem> = [
		{
			name: "isentinel/roblox/setup",
			plugins: {
				"cease-nonsense": pluginCeaseNonsense,
				"roblox": pluginRobloxTs,
				"sentinel": pluginSentinel,
			},
		},
		// assign type-aware parser for type-aware files and type-unaware
		// parser for the rest
		...(isTypeAware
			? [makeParser(false, files), makeParser(true, filesTypeAware, ignoresTypeAware)]
			: [makeParser(false, files)]),
		{
			name: "isentinel/roblox",
			files,
			rules: {
				"cease-nonsense/no-array-size-assignment": "error",

				"roblox/no-any": "error",
				"roblox/no-enum-merging": "error",
				"roblox/no-export-assignment-let": "error",
				"roblox/no-for-in": "error",
				"roblox/no-function-expression-name": "error",
				"roblox/no-get-set": "error",
				"roblox/no-implicit-self": "error",
				"roblox/no-invalid-identifier": "error",
				"roblox/no-namespace-merging": "error",
				"roblox/no-null": "error",
				"roblox/no-private-identifier": "error",
				"roblox/no-unsupported-syntax": "error",
				"roblox/no-user-defined-lua-tuple": "error",
				"roblox/no-value-typeof": "error",
				"roblox/prefer-get-players": "error",
				"roblox/prefer-task-library": "error",

				...(stylistic !== false
					? {
							"sentinel/prefer-math-min-max": "error",
						}
					: {}),

				...overrides,
			},
		},
		...(isTypeAware
			? [
					{
						name: "isentinel/roblox/rules-type-aware",
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

	if (formatLua) {
		const pluginFormatLua = await interopDefault(import("eslint-plugin-format-lua"));

		configs.push(
			{
				name: "isentinel/roblox/format-lua/setup",
				plugins: {
					"format-lua": pluginFormatLua,
				},
			},
			{
				name: "isentinel/roblox/format-lua",
				files: [GLOB_LUA],
				languageOptions: {
					parser: parserPlain,
				},
				rules: {
					"format-lua/stylua": "error",
				},
			},
		);
	}

	return configs;
}
