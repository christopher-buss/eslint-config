import { GLOB_SRC } from "../../globs.ts";
import type { TypedOxlintConfigItem } from "../../types.ts";

export function oxlintComments(): Array<TypedOxlintConfigItem> {
	return [
		{
			name: "isentinel/oxlint/comments",
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
	];
}
