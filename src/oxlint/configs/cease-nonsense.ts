import { GLOB_ALL_SRC } from "../../globs.ts";
import type { OptionsIsInEditor, OptionsStylistic, TypedOxlintConfigItem } from "../types.ts";

export function oxlintCeaseNonsense(
	options: OptionsIsInEditor & OptionsStylistic = {},
): Array<TypedOxlintConfigItem> {
	const { isInEditor = false, stylistic = true } = options;

	return [
		{
			name: "isentinel/oxlint/cease-nonsense",
			files: GLOB_ALL_SRC,
			jsPlugins: [
				{
					name: "cease-nonsense",
					specifier: "@pobammer-ts/eslint-cease-nonsense-rules",
				},
			],
			rules: {
				"cease-nonsense/no-async-constructor": "error",
				"cease-nonsense/no-commented-code": isInEditor ? "off" : "error",
				"cease-nonsense/prefer-class-properties": "error",
				"cease-nonsense/prefer-early-return": ["error", { maximumStatements: 1 }],
				"cease-nonsense/react-hooks-strict-return": "error",
				"cease-nonsense/strict-component-boundaries": "error",

				...(stylistic !== false
					? {
							"cease-nonsense/prefer-module-scope-constants": "error",
							"cease-nonsense/prefer-singular-enums": "error",
						}
					: {}),
			},
		},
	];
}
