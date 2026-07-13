import { GLOB_SRC } from "../../globs.ts";
import { spellingRules } from "../../rules/spelling.ts";
import { interopDefault } from "../../utils.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsIsInEditor,
	SpellCheckConfig,
	TypedFlatConfigItem,
} from "../types.ts";

export async function spelling(
	options: OptionsComponentExtensions & OptionsFiles & OptionsIsInEditor & SpellCheckConfig = {},
): Promise<Array<TypedFlatConfigItem>> {
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

	const pluginCspell = await interopDefault(import("@cspell/eslint-plugin"));

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
