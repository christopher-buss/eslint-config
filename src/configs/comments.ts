import { GLOB_SRC, GLOB_YAML } from "../globs";
import type { OptionsFormatters, OptionsStylistic, TypedFlatConfigItem } from "../types";
import { interopDefault } from "../utils";

export async function comments(
	options: OptionsFormatters & OptionsStylistic = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { prettierOptions = {}, stylistic = true } = options;

	const [pluginCommentLength, pluginComments, pluginStylistic] = await Promise.all([
		interopDefault(import("eslint-plugin-comment-length")),
		// @ts-expect-error -- No types
		interopDefault(import("@eslint-community/eslint-plugin-eslint-comments")),
		interopDefault(import("@stylistic/eslint-plugin")),
	]);

	console.log(prettierOptions.tabWidth);

	return [
		{
			name: "isentinel/eslint/comments",
			plugins: {
				"comment-length": pluginCommentLength,
				"eslint-comments": pluginComments,
				"style": pluginStylistic,
			},
			rules: {
				// We cover these with prettier
				"comment-length/limit-multi-line-comments": "off",

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

				...(stylistic !== false
					? {
							"no-inline-comments": "error",
							"style/multiline-comment-style": ["error", "separate-lines"],
						}
					: {}),
			},
		},
		{
			files: [GLOB_YAML],
			rules: {
				"no-inline-comments": "off",
			},
		},
		...(stylistic !== false
			? [
					{
						files: [GLOB_SRC],
						rules: {
							"comment-length/limit-single-line-comments": [
								"error",
								{
									maxLength: Number(prettierOptions.jsdocPrintWidth) + 2,
									tabSize: prettierOptions.tabWidth,
								},
							],
						},
					} as TypedFlatConfigItem,
				]
			: []),
	];
}
