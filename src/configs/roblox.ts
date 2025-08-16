import { GLOB_LUA } from "../globs";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsOverrides,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types";
import { createTsParser, getTsConfig, interopDefault, parserPlain } from "../utils";

export async function roblox(
	options: OptionsComponentExtensions &
		OptionsFiles &
		OptionsOverrides &
		OptionsStylistic &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes = {},
	formatLua = true,
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		parserOptions = {},
		stylistic = true,
		typeAware = true,
	} = options;

	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	const [parserTs, pluginRobloxTs, pluginSentinel] = await Promise.all([
		interopDefault(import("@typescript-eslint/parser")),
		interopDefault(import("eslint-plugin-roblox-ts")),
		interopDefault(import("eslint-plugin-sentinel")),
	] as const);

	const files = options.files ?? [
		"**/*/*.?([cm])ts",
		"**/*/*.?([cm])tsx",
		...componentExtensions.map((extension) => `**/*/*.${extension}`),
	];

	const configs: Array<TypedFlatConfigItem> = [
		{
			name: "isentinel/roblox/setup",
			plugins: {
				roblox: pluginRobloxTs,
				sentinel: pluginSentinel,
			},
		},
	];

	configs.push({
		...createTsParser({
			componentExtensions,
			configName: "roblox",
			files,
			parser: parserTs,
			parserOptions,
			tsconfigPath,
			typeAware: isTypeAware,
		}),
		name: "isentinel/roblox",
		rules: {
			"roblox/lua-truthiness": "warn",
			"roblox/misleading-lua-tuple-checks": "error",
			"roblox/no-any": "error",
			"roblox/no-array-pairs": "warn",
			"roblox/no-enum-merging": "error",
			"roblox/no-export-assignment-let": "error",
			"roblox/no-for-in": "error",
			"roblox/no-function-expression-name": "error",
			"roblox/no-get-set": "error",
			"roblox/no-implicit-self": "error",
			"roblox/no-invalid-identifier": "error",
			"roblox/no-namespace-merging": "error",
			"roblox/no-null": "error",
			"roblox/no-object-math": "error",
			"roblox/no-post-fix-new": "error",
			"roblox/no-preceding-spread-element": "error",
			"roblox/no-private-identifier": "error",
			"roblox/no-unsupported-syntax": "error",
			"roblox/no-user-defined-lua-tuple": "error",
			"roblox/no-value-typeof": "error",
			"roblox/prefer-get-players": "error",
			"roblox/prefer-task-library": "error",
			"roblox/size-method": "error",

			"sentinel/explicit-size-check": "error",

			...(stylistic !== false
				? {
						"sentinel/prefer-math-min-max": "error",
					}
				: {}),
		},
	});

	if (formatLua) {
		const [pluginFormatLua] = await Promise.all([
			interopDefault(import("eslint-plugin-format-lua")),
		]);

		configs.push(
			{
				name: "isentinel/roblox/format-lua/setup",
				plugins: {
					"format-lua": pluginFormatLua,
				},
			},
			{
				files: [GLOB_LUA],
				languageOptions: {
					parser: parserPlain,
				},
				name: "isentinel/roblox/format-lua",
				rules: {
					"format-lua/stylua": "error",
				},
			},
		);
	}

	return configs;
}
