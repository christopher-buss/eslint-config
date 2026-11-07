import globals from "globals";

import { GLOB_SRC } from "../../globs.ts";
import { javascriptRules } from "../../rules/javascript.ts";
import type {
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsStylistic,
} from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
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

	const configs = createOxlintConfigs({
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
	});

	for (const config of configs) {
		const idLength = config.rules?.["id-length"];
		if (Array.isArray(idLength)) {
			config.rules = {
				...config.rules,
				"id-length": [idLength[0], { ...idLength[1], checkGeneric: false }],
			};
		}
	}

	return configs;
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
