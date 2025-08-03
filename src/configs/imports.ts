import { GLOB_SRC } from "../globs";
import type { OptionsProjectType, OptionsStylistic, TypedFlatConfigItem } from "../types";
import { interopDefault } from "../utils";

export async function imports(
	options: OptionsProjectType & OptionsStylistic = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { stylistic = true, type = "game" } = options;

	const [pluginImport, pluginSimpleImportSort, pluginAntfu] = await Promise.all([
		interopDefault(import("eslint-plugin-import-lite")),
		interopDefault(import("eslint-plugin-simple-import-sort")),
		interopDefault(import("eslint-plugin-antfu")),
	]);

	return [
		{
			name: "isentinel/imports/rules",
			plugins: {
				antfu: pluginAntfu,
				import: pluginImport,
			},
			rules: {
				"antfu/import-dedupe": "error",
				"antfu/no-import-dist": "error",
				"antfu/no-import-node-modules-by-path": "error",

				"import/first": "error",
				"import/no-duplicates": "error",
				"import/no-mutable-exports": "error",
				"import/no-named-default": "error",

				...(stylistic
					? {
							"import/newline-after-import": [
								"error",
								{ considerComments: true, count: 1 },
							],
						}
					: {}),
			},
		},
		stylistic
			? {
					languageOptions: {
						parserOptions: {
							sourceType: "script",
						},
					},
					name: "isentinel/import-sort",
					plugins: {
						"simple-import-sort": pluginSimpleImportSort,
					},
					rules: {
						"simple-import-sort/exports": "error",
						"simple-import-sort/imports": [
							"error",
							{
								groups: [["^react"], ["@?"], ["^\\w"], ["^\\."]],
							},
						],
					},
				}
			: {},
		...(type === "game"
			? [
					{
						files: [`src/${GLOB_SRC}`],
						name: "isentinel/imports/game",
						rules: {
							"no-restricted-syntax": [
								"error",
								{
									message: "Prefer named exports",
									selector: "ExportDefaultDeclaration",
								},
							],
						} satisfies TypedFlatConfigItem["rules"],
					},
				]
			: []),
	];
}
