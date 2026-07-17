import { GLOB_SRC } from "../../globs.ts";
import { commentLengthRules, commentsRules } from "../../rules/comments.ts";
import { interopDefault } from "../../utils.ts";
import type { OptionsFormatters, OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

export async function comments({
	prettierOptions = {},
	stylistic = true,
}: OptionsFormatters & OptionsStylistic = {}): Promise<Array<TypedFlatConfigItem>> {
	const [pluginCommentLength, pluginComments, pluginStylistic] = await Promise.all([
		interopDefault(import("eslint-plugin-comment-length")),
		interopDefault(import("@eslint-community/eslint-plugin-eslint-comments")),
		interopDefault(import("@stylistic/eslint-plugin")),
	]);

	return [
		{
			name: "isentinel/eslint/comments",
			plugins: {
				"comment-length": pluginCommentLength,
				"eslint-comments": pluginComments,
				"style": pluginStylistic,
			},
			rules: {
				"eslint-comments/disable-enable-pair": ["error", { allowWholeFile: true }],
				"eslint-comments/no-aggregating-enable": "error",
				"eslint-comments/no-duplicate-disable": "error",
				"eslint-comments/no-unlimited-disable": "error",
				"eslint-comments/no-unused-enable": "error",
				"eslint-comments/require-description": [
					"error",
					{
						ignore: ["eslint-enable"],
					},
				],

				...commentsRules({ stylistic }),
			},
		},
		...(stylistic !== false
			? [
					{
						name: "isentinel/eslint/comments/src",
						files: [GLOB_SRC],
						rules: commentLengthRules({
							maxLength: (Number(prettierOptions["jsdocPrintWidth"]) || 80) + 2,
							/* Remove when oxc wraps multi-line comments: https://github.com/oxc-project/oxc/issues/24633 */
							multiLineMaxLength: Number(prettierOptions["jsdocPrintWidth"]) || 80,
							semanticComments: ["oxlint-disable", "oxlint-enable"],
							tabSize: prettierOptions.tabWidth ?? 4,
						}),
					} as TypedFlatConfigItem,
				]
			: []),
	];
}
