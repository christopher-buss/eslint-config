import globals from "globals";

import { GLOB_SRC } from "../../globs.ts";
import { ID_LENGTH_OPTIONS, javascriptRules } from "../../rules/javascript.ts";
import type {
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsStylistic,
} from "../../types.ts";
import type { OxlintRules, TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintJavascript(
	options: OptionsFiles &
		OptionsHasRoblox &
		OptionsIsInEditor &
		OptionsOverrides &
		OptionsStylistic & { excludeFiles?: Array<string> } = {},
): Array<TypedOxlintConfigItem> {
	const {
		excludeFiles,
		isInEditor = false,
		overrides = {},
		roblox = true,
		stylistic = true,
	} = options;

	const files = options.files?.flat() ?? [GLOB_SRC];

	return [
		...(stylistic !== false
			? [
					{
						name: "isentinel/javascript/oxlint",
						...(excludeFiles ? { excludeFiles } : {}),
						files,
						rules: {
							"id-length": ["error", { ...ID_LENGTH_OPTIONS, checkGeneric: false }],
						} satisfies OxlintRules,
					},
				]
			: []),
		...createOxlintConfigs({
			name: "isentinel/javascript",
			...(excludeFiles ? { excludeFiles } : {}),
			files,
			globals: {
				...toGlobals(globals.browser),
				...toGlobals(globals.es2021),
				...toGlobals(globals.node),
				document: "readonly",
				navigator: "readonly",
				window: "readonly",
			},
			overrides,
			rules: javascriptRules({ isInEditor, roblox, stylistic }),
		}),
	];
}

function toGlobals(
	source: Record<string, boolean>,
	override?: "readonly" | "writable",
): Record<string, "readonly" | "writable"> {
	const result: Record<string, "readonly" | "writable"> = {};
	for (const [key, value] of Object.entries(source)) {
		result[key] = override ?? (value ? "writable" : "readonly");
	}

	return result;
}
