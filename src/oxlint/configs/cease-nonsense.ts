import { GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { ceaseNonsenseRules } from "../../rules/cease-nonsense.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsIsInEditor,
	OptionsStylistic,
} from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintCeaseNonsense(
	options: OptionsComponentExtensions & OptionsFiles & OptionsIsInEditor & OptionsStylistic = {},
): Array<TypedOxlintConfigItem> {
	const {
		componentExts: componentExtensions = [],
		isInEditor = false,
		stylistic = true,
	} = options;

	const files = options.files?.flat() ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	return createOxlintConfigs({
		name: "isentinel/cease-nonsense",
		files,
		rules: ceaseNonsenseRules({ isInEditor, stylistic }),
	});
}
