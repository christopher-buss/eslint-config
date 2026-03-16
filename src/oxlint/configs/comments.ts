import { GLOB_ALL_SRC, GLOB_SRC } from "../../globs.ts";
import type { OptionsFormatters, OptionsStylistic, TypedOxlintConfigItem } from "../types.ts";

export function oxlintComments(
	options: OptionsFormatters & OptionsStylistic = {},
): Array<TypedOxlintConfigItem> {
	const { oxfmtOptions = {}, stylistic = true } = options;
	const printWidth = oxfmtOptions.printWidth ?? 80;
	const tabSize = oxfmtOptions.tabWidth ?? 4;

	return [
		{
			name: "isentinel/oxlint/comments",
			files: GLOB_ALL_SRC,
			jsPlugins: [
				{ name: "oxlint-comments", specifier: "oxlint-plugin-oxlint-comments" },
				...(stylistic !== false
					? [{ name: "style", specifier: "@stylistic/eslint-plugin" }]
					: []),
			],
			plugins: ["eslint"],
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

				...(stylistic !== false
					? {
							"eslint/no-inline-comments": "error",
							"style/multiline-comment-style": ["error", "separate-lines"],
						}
					: {}),
			},
		},
		...(stylistic !== false
			? [
					{
						name: "isentinel/oxlint/comments/src",
						files: [GLOB_SRC],
						jsPlugins: [
							{
								name: "comment-length",
								specifier: "eslint-plugin-comment-length",
							},
						],
						rules: {
							"comment-length/limit-single-line-comments": [
								"error",
								{
									maxLength: printWidth + 2,
									tabSize,
								},
							],
						},
					} as TypedOxlintConfigItem,
				]
			: []),
	];
}
