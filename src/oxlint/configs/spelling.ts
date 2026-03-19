import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import type { SpellCheckConfig } from "../../eslint/types.ts";
import { GLOB_SRC } from "../../globs.ts";
import type {
	JsPluginRules,
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsIsInEditor,
	TypedOxlintConfigItem,
} from "../types.ts";

const require = createRequire(import.meta.url);

export function oxlintSpelling(
	options: OptionsComponentExtensions & OptionsFiles & OptionsIsInEditor & SpellCheckConfig = {},
): Array<TypedOxlintConfigItem> {
	const {
		componentExts: componentExtensions = [],
		inEditor,
		isInEditor = false,
		language = "en-US",
	} = options;

	const files = options.files?.flat() ?? [
		GLOB_SRC,
		...componentExtensions.map((extension: string) => `**/*.${extension}`),
	];

	const robloxDictionary = require.resolve("@isentinel/dict-roblox");
	const urlRobloxDictionary = pathToFileURL(robloxDictionary);
	const urlRoblox = new URL("dict/roblox.txt", urlRobloxDictionary);

	const rbxtsDictionary = require.resolve("@isentinel/dict-rbxts");
	const urlRbxtsDictionary = pathToFileURL(rbxtsDictionary);
	const urlRbxts = new URL("dict/rbxts.txt", urlRbxtsDictionary);

	const enabled = inEditor === false ? isInEditor : true;

	const jsPluginRules = {
		"@cspell/spellchecker": [
			enabled ? "warn" : "off",
			{
				autoFix: false,
				checkComments: true,
				cspell: {
					dictionaries: ["roblox", "rbxts"],
					dictionaryDefinitions: [
						{
							name: "roblox",
							path: urlRoblox.href,
						},
						{
							name: "rbxts",
							path: urlRbxts.href,
						},
					],
					language,
					words: ["isentinel"],
				},
				generateSuggestions: isInEditor,
				numSuggestions: isInEditor ? 8 : 0,
			},
		],
	} satisfies JsPluginRules;

	return [
		{
			name: "isentinel/oxlint/spelling",
			files,
			jsPlugins: [{ name: "@cspell", specifier: "@cspell/eslint-plugin" }],
			rules: jsPluginRules,
		},
	];
}
