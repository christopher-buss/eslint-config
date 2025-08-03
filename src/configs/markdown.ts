import { mergeProcessors, processorPassThrough } from "eslint-merge-processors";

import { GLOB_MARKDOWN, GLOB_MARKDOWN_CODE, GLOB_MARKDOWN_IN_MARKDOWN } from "../globs";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsOverrides,
	OptionsProjectType,
	TypedFlatConfigItem,
} from "../types";
import { interopDefault, parserPlain } from "../utils";

export async function markdown(
	options: OptionsComponentExtensions & OptionsFiles & OptionsOverrides & OptionsProjectType = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		files = [GLOB_MARKDOWN],
		overrides = {},
		type = "game",
	} = options;

	const markdownPlugin = await interopDefault(import("@eslint/markdown"));

	return [
		{
			name: "isentinel/markdown/setup",
			plugins: {
				markdown: markdownPlugin,
			},
		},
		{
			files,
			ignores: [GLOB_MARKDOWN_IN_MARKDOWN],
			name: "isentinel/markdown/processor",
			// `eslint-plugin-markdown` only creates virtual files for code blocks,
			// but not the markdown file itself. We use `eslint-merge-processors` to
			// add a pass-through processor for the markdown file itself.
			processor: mergeProcessors([markdownPlugin.processors.markdown, processorPassThrough]),
		},
		{
			files,
			language: "markdown/gfm",
			languageOptions: {
				frontmatter: "yaml",
				parser: parserPlain,
			},
			name: "isentinel/markdown/parser",
			rules: {
				"isentinel/indent": "off",
				// Recommended rules - enabled for both game and package
				"markdown/fenced-code-language": "error",
				"markdown/no-duplicate-definitions": "error",
				"markdown/no-empty-definitions": "error",
				"markdown/no-empty-images": "error",
				"markdown/no-empty-links": "error",
				"markdown/no-html": [
					"error",
					{
						allowed: [
							"dd",
							"details",
							"div",
							"dl",
							"dt",
							"ins",
							"kbd",
							"q",
							"rp",
							"rt",
							"ruby",
							"samp",
							"span",
							"sub",
							"summary",
							"sup",
							"var",
						],
					},
				],
				"markdown/no-invalid-label-refs": "error",
				"markdown/no-missing-atx-heading-space": "error",
				"markdown/no-missing-label-refs": "error",
				"markdown/no-missing-link-fragments": "error",
				"markdown/no-multiple-h1": "error",
				"markdown/no-reversed-media-syntax": "error",
				"markdown/no-unused-definitions": "warn",
				"markdown/require-alt-text": "error",

				"markdown/table-column-count": "error",

				// Package-specific stricter rules
				...(type === "package"
					? {
							"markdown/heading-increment": "error",
							"markdown/no-bare-urls": "error",
							"markdown/no-duplicate-headings": "error",
						}
					: {}),
			},
		},
		{
			files: [
				GLOB_MARKDOWN_CODE,
				...componentExtensions.map((extension) => `${GLOB_MARKDOWN}/**/*.${extension}`),
			],
			languageOptions: {
				parserOptions: {
					ecmaFeatures: {
						impliedStrict: true,
					},
				},
			},
			name: "isentinel/markdown/disables",
			rules: {
				"antfu/no-top-level-await": "off",
				"import/newline-after-import": "off",
				"no-alert": "off",
				"no-console": "off",
				"no-labels": "off",
				"no-lone-blocks": "off",
				"no-restricted-syntax": "off",
				"no-undef": "off",
				"no-unused-expressions": "off",
				"no-unused-labels": "off",
				"no-unused-vars": "off",
				"node/prefer-global/process": "off",
				"strict": "off",
				"style/comma-dangle": "off",
				"style/eol-last": "off",
				"style/indent": "off",
				"style/padded-blocks": "off",
				"ts/consistent-type-imports": "off",
				"ts/no-namespace": "off",
				"ts/no-redeclare": "off",
				"ts/no-require-imports": "off",
				"ts/no-unused-vars": "off",
				"ts/no-use-before-define": "off",
				"ts/no-var-requires": "off",
				"unicode-bom": "off",
				"unused-imports/no-unused-imports": "off",
				"unused-imports/no-unused-vars": "off",

				...overrides,
			},
		},
	];
}
