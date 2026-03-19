import { GLOB_SRC } from "../../globs.ts";
import type {
	JsPluginRules,
	OptionsProjectType,
	OptionsStylistic,
	OxlintRules,
	TypedOxlintConfigItem,
} from "../types.ts";

export function oxlintImports(
	options: OptionsProjectType & OptionsStylistic = {},
): Array<TypedOxlintConfigItem> {
	const { stylistic = true, type = "game" } = options;

	const nativeRules = {
		"import/first": "error",
		"import/no-absolute-path": "error",
		"import/no-cycle": "error",
		"import/no-duplicates": "error",
		"import/no-dynamic-require": "error",
		"import/no-empty-named-blocks": "error",
		"import/no-mutable-exports": "error",
		"import/no-named-as-default": "error",
		"import/no-named-default": "error",
		"import/no-namespace": "error",
	} as const satisfies OxlintRules;

	const jsPluginRules = {
		"antfu/import-dedupe": "error",
		"antfu/no-import-dist": "error",
		"antfu/no-import-node-modules-by-path": "error",

		...(stylistic !== false
			? {
					"import-js/newline-after-import": [
						"error",
						{ considerComments: true, count: 1 },
					],
				}
			: {}),
	} satisfies JsPluginRules;

	return [
		{
			name: "isentinel/oxlint/imports",
			files: [GLOB_SRC],
			plugins: ["import"],
			rules: nativeRules,
		},
		{
			name: "isentinel/oxlint/imports/js-plugin",
			files: [GLOB_SRC],
			jsPlugins: [
				{ name: "antfu", specifier: "eslint-plugin-antfu" },
				{ name: "import-js", specifier: "eslint-plugin-import-lite" },
			],
			rules: jsPluginRules,
		},
		...(type === "game" || type === "app"
			? [
					{
						name: "isentinel/oxlint/imports/game",
						files: [`src/${GLOB_SRC}`],
						jsPlugins: [{ name: "eslint-js", specifier: "oxlint-plugin-eslint" }],
						rules: {
							"eslint-js/no-restricted-syntax": [
								"error",
								{
									message: "Prefer named exports",
									selector: "ExportDefaultDeclaration",
								},
							],
						} satisfies JsPluginRules,
					} as TypedOxlintConfigItem,
				]
			: []),
	];
}
