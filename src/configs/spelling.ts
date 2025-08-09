import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { GLOB_SRC } from "../globs";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsIsInEditor,
	SpellCheckConfig,
	TypedFlatConfigItem,
} from "../types";
import { interopDefault } from "../utils";

const require = createRequire(import.meta.url);

export async function spelling(
	options: OptionsComponentExtensions & OptionsFiles & OptionsIsInEditor & SpellCheckConfig = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		inEditor = true,
		isInEditor = false,
		language = "en-US",
	} = options;

	const files = options.files ?? [
		GLOB_SRC,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	const robloxDictionary = require.resolve("@isentinel/dict-roblox");
	const urlRobloxDictionary = pathToFileURL(robloxDictionary);
	const urlRoblox = new URL("dict/roblox.txt", urlRobloxDictionary);

	const rbxtsDictionary = require.resolve("@isentinel/dict-rbxts");
	const urlRbxtsDictionary = pathToFileURL(rbxtsDictionary);
	const urlRbxts = new URL("dict/rbxts.txt", urlRbxtsDictionary);

	const pluginCspell = await interopDefault(import("@cspell/eslint-plugin"));

	const enabled = inEditor === false ? isInEditor : true;

	return [
		{
			name: "isentinel/spelling/setup",
			plugins: {
				"@cspell": pluginCspell,
			},
		},
		{
			files,
			name: "isentinel/spelling",
			rules: {
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
						generateSuggestions: true,
						numSuggestions: 8,
					},
				],
			},
		},
	];
}
