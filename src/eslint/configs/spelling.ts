import { GLOB_SRC } from "../../globs.ts";
import { spellingRules } from "../../rules/spelling.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsIsInEditor,
	SpellCheckConfig,
	TypedFlatConfigItem,
} from "../types.ts";

export function spelling(
	options: OptionsComponentExtensions & OptionsFiles & OptionsIsInEditor & SpellCheckConfig = {},
): Array<TypedFlatConfigItem> {
	const {
		componentExts: componentExtensions = [],
		inEditor,
		isInEditor = false,
		language = "en-US",
	} = options;

	const files = options.files ?? [
		GLOB_SRC,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	// Hybrid mode drops `@cspell/spellchecker` for source files (oxlint owns
	// it), so this survives only in `isentinel/spelling/markdown-code`.
	const pluginCspell = lazyPlugin("@cspell/eslint-plugin");

	return [
		{
			name: "isentinel/spelling/setup",
			plugins: {
				"@cspell": pluginCspell,
			},
		},
		{
			name: "isentinel/spelling",
			files,
			rules: spellingRules({ inEditor, isInEditor, language }),
		},
	];
}
