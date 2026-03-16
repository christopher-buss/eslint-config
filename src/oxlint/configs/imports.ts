import { GLOB_SRC } from "../../globs.ts";
import type {
	OptionsProjectType,
	OptionsStylistic,
	Rules,
	TypedOxlintConfigItem,
} from "../../types.ts";

export function oxlintImports(
	_options: OptionsProjectType & OptionsStylistic = {},
): Array<TypedOxlintConfigItem> {
	// Inlined from importRules(), with omitted rules removed.
	// TODO(oxlint): not yet implemented (oxc-project/oxc#493)
	// import/newline-after-import

	const rules: Rules = {
		"antfu/import-dedupe": "error",
		"antfu/no-import-dist": "error",
		"antfu/no-import-node-modules-by-path": "error",

		"import/first": "error",
		"import/no-duplicates": "error",
		"import/no-mutable-exports": "error",
		"import/no-named-default": "error",

		// Omitted: import/newline-after-import (not yet implemented)
	};

	return [
		{
			name: "isentinel/imports/rules",
			files: [GLOB_SRC],
			jsPlugins: [{ name: "antfu", specifier: "eslint-plugin-antfu" }],
			plugins: ["import"],
			rules,
		},
	];
}
