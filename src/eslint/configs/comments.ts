import { GLOB_MARKDOWN_CODE, GLOB_SRC } from "../../globs.ts";
import { commentLengthRules, commentsRules } from "../../rules/comments.ts";
import { interopDefault } from "../../utils.ts";
import type { MarkdownWidthOverride, MarkdownWidths } from "../../utils.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type { OptionsFormatters, OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

export async function comments({
	markdownCode,
	markdownCodeOverrides = [],
	prettierOptions = {},
	stylistic = true,
}: OptionsFormatters &
	OptionsStylistic & {
		/** The widths oxfmt formats Markdown code blocks with. */
		markdownCode?: MarkdownWidths;
		/** Oxfmt config overrides that change the Markdown widths. */
		markdownCodeOverrides?: Array<MarkdownWidthOverride>;
	} = {}): Promise<Array<TypedFlatConfigItem>> {
	function lengthRules(tabSize: number | undefined): TypedFlatConfigItem["rules"] {
		return commentLengthRules({
			maxLength: (Number(prettierOptions["jsdocPrintWidth"]) || 80) + 2,
			/* Remove when oxc wraps multi-line comments: https://github.com/oxc-project/oxc/issues/24633 */
			multiLineMaxLength: Number(prettierOptions["jsdocPrintWidth"]) || 80,
			semanticComments: ["oxlint-disable", "oxlint-enable"],
			tabSize: tabSize ?? prettierOptions.tabWidth ?? 4,
		});
	}

	const pluginCommentLength = lazyPlugin("eslint-plugin-comment-length");
	// Registered but never read here; `stylistic()` is what reads the object,
	// and it is skipped entirely when `stylistic: false`.
	const pluginStylistic = lazyPlugin("@stylistic/eslint-plugin");
	const pluginComments = await interopDefault(
		import("@eslint-community/eslint-plugin-eslint-comments"),
	);

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
						rules: lengthRules(undefined),
					} as TypedFlatConfigItem,
					// Code blocks in Markdown use the Markdown widths, as oxfmt.
					...(markdownCode === undefined
						? []
						: [
								{
									name: "isentinel/eslint/comments/markdown-code",
									files: [GLOB_MARKDOWN_CODE],
									rules: lengthRules(markdownCode.tabWidth),
								} as TypedFlatConfigItem,
								...markdownCodeOverrides.map(
									({ excludeFiles, files, widths }, index) => {
										return {
											name: `isentinel/eslint/comments/markdown-code/override-${index}`,
											files: files.map((glob) => `${glob}/${GLOB_SRC}`),
											ignores: excludeFiles.map((glob) => `${glob}/**`),
											rules: lengthRules(
												widths.tabWidth ?? markdownCode.tabWidth,
											),
										} as TypedFlatConfigItem;
									},
								),
							]),
				]
			: []),
	];
}
