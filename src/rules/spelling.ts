import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import type { OptionsIsInEditor, TypedFlatConfigItem } from "../types.ts";

const require = createRequire(import.meta.url);

export interface SpellingRuleOptions extends OptionsIsInEditor {
	/**
	 * Whether or not to run the spell checker in the editor.
	 *
	 * @default true
	 */
	inEditor?: boolean;
	/** Defaults to `en-US`. */
	language?: string;
}

/**
 * CSpell rules shared between the ESLint and oxlint factories.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function spellingRules({
	inEditor,
	isInEditor = false,
	language = "en-US",
}: SpellingRuleOptions = {}): TypedFlatConfigItem["rules"] {
	const robloxDictionary = require.resolve("@isentinel/dict-roblox");
	const urlRobloxDictionary = pathToFileURL(robloxDictionary);
	const urlRoblox = new URL("dict/roblox.txt", urlRobloxDictionary);

	const rbxtsDictionary = require.resolve("@isentinel/dict-rbxts");
	const urlRbxtsDictionary = pathToFileURL(rbxtsDictionary);
	const urlRbxts = new URL("dict/rbxts.txt", urlRbxtsDictionary);

	const enabled = inEditor === false ? isInEditor : true;

	return {
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
					words: ["isentinel", "uninvoked"],
				},
				generateSuggestions: isInEditor,
				numSuggestions: isInEditor ? 8 : 0,
			},
		],
	};
}
