import { GLOB_SRC } from "../../globs.ts";
import { commentLengthRules, commentsRules } from "../../rules/comments.ts";
import type { OptionsStylistic } from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintComments({
	prettierOptions = {},
	stylistic = true,
}: OptionsStylistic & {
	prettierOptions?: Record<string, unknown>;
} = {}): Array<TypedOxlintConfigItem> {
	return [
		{
			name: "isentinel/comments/directives",
			files: [GLOB_SRC],
			jsPlugins: [{ name: "oxlint-comments", specifier: "oxlint-plugin-oxlint-comments" }],
			rules: {
				"oxlint-comments/disable-enable-pair": ["error", { allowWholeFile: true }],
				"oxlint-comments/no-aggregating-enable": "error",
				"oxlint-comments/no-duplicate-disable": "error",
				"oxlint-comments/no-unlimited-disable": "error",
				"oxlint-comments/no-unused-enable": "error",
				"oxlint-comments/require-description": [
					"error",
					{
						ignore: ["oxlint-enable"],
					},
				],
			},
		},
		...createOxlintConfigs({
			name: "isentinel/comments",
			files: [GLOB_SRC],
			rules: commentsRules({ stylistic }),
		}),
		...(stylistic !== false
			? createOxlintConfigs({
					name: "isentinel/comments/length",
					files: [GLOB_SRC],
					rules: commentLengthRules({
						maxLength: (Number(prettierOptions["jsdocPrintWidth"]) || 80) + 2,
						semanticComments: ["oxlint-disable", "oxlint-enable"],
						tabSize:
							typeof prettierOptions["tabWidth"] === "number"
								? prettierOptions["tabWidth"]
								: 4,
					}),
				})
			: []),
	];
}
