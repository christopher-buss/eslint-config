import { GLOB_LUA, GLOB_SRC } from "../../globs.ts";
import type {
	JsPluginRules,
	OptionsFiles,
	OptionsOverrides,
	OptionsStylistic,
	TypedOxlintConfigItem,
} from "../types.ts";

export function roblox(
	options: OptionsFiles & OptionsOverrides & OptionsStylistic = {},
	formatLua = true,
): Array<TypedOxlintConfigItem> {
	const { overrides = {}, stylistic = true } = options;

	const files = options.files?.flat() ?? [GLOB_SRC];

	const jsPluginRules = {
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
	} satisfies JsPluginRules;

	const configs: Array<TypedOxlintConfigItem> = [
		{
			name: "isentinel/oxlint/roblox",
			files,
			jsPlugins: [
				{ name: "cease-nonsense", specifier: "@pobammer-ts/eslint-cease-nonsense-rules" },
				{ name: "roblox", specifier: "eslint-plugin-roblox-ts" },
				{ name: "sentinel", specifier: "eslint-plugin-sentinel" },
			],
			rules: {
				...jsPluginRules,
				...overrides,
			},
		},
	];

	if (formatLua) {
		configs.push({
			name: "isentinel/oxlint/roblox/format-lua",
			files: [GLOB_LUA],
			jsPlugins: [{ name: "format-lua", specifier: "eslint-plugin-format-lua" }],
			rules: {
				"format-lua/stylua": "error",
			} satisfies JsPluginRules,
		});
	}

	return configs;
}
