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

/** Oxlint's globals map: a name to the access it is granted. */
type GlobalsMap = Record<string, "readonly" | "writable">;

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

	return createOxlintConfigs({
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
}

function toGlobals(
	source: Record<string, boolean>,
	override?: "readonly" | "writable",
): GlobalsMap {
	return Object.fromEntries(
		Object.entries(source).map(([key, value]) => [
			key,
			override ?? (value ? "writable" : "readonly"),
		]),
	);
}
