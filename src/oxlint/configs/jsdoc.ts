import { GLOB_SRC } from "../../globs.ts";
import type {
	JsdocOptions,
	JsPluginRules,
	OptionsProjectType,
	OptionsStylistic,
	OxlintRules,
	TypedOxlintConfigItem,
} from "../types.ts";

export function oxlintJsdoc(
	options: JsdocOptions & OptionsProjectType & OptionsStylistic = {},
): Array<TypedOxlintConfigItem> {
	const { full = false, stylistic = true, type = "game" } = options;
	const isPackage = full || type === "package";

	const nativeRules = {
		"jsdoc/check-access": "warn",
		"jsdoc/check-property-names": "warn",
		"jsdoc/empty-tags": "warn",
		"jsdoc/implements-on-classes": "warn",
		"jsdoc/no-defaults": "warn",
		"jsdoc/require-param-description": "warn",
		"jsdoc/require-param-name": "warn",
		"jsdoc/require-property": "warn",
		"jsdoc/require-property-description": "warn",
		"jsdoc/require-property-name": "warn",
		"jsdoc/require-returns-description": "warn",

		...(isPackage
			? {
					"jsdoc/require-param": [
						"warn",
						{ checkDestructured: false, exemptedBy: ["ignore"] },
					],
					"jsdoc/require-returns": ["warn", { exemptedBy: ["hidden"] }],
				}
			: {}),
	} satisfies OxlintRules;

	const jsPluginRules = {
		"jsdoc-js/check-param-names": ["warn", { checkDestructured: false }],
		"jsdoc-js/check-types": "warn",
		"jsdoc-js/convert-to-jsdoc-comments": "warn",
		"jsdoc-js/informative-docs": "warn",
		"jsdoc-js/no-types": "warn",
		"jsdoc-js/no-undefined-types": "error",
		"jsdoc-js/require-description": [
			"warn",
			{
				exemptedBy: [
					"hidden",
					"ignore",
					"inheritdoc",
					"client",
					"server",
					"see",
					"metadata",
				],
			},
		],
		"jsdoc-js/require-description-complete-sentence": "warn",
		"jsdoc-js/require-rejects": "error",
		"jsdoc-js/require-returns-check": "warn",
		"jsdoc-js/require-yields-check": "warn",
		"jsdoc-js/sort-tags": "off",

		...(isPackage
			? {
					"jsdoc-js/require-template": "warn",
				}
			: {}),

		...(stylistic !== false
			? {
					"jsdoc-js/check-alignment": "warn",
					"jsdoc-js/multiline-blocks": "warn",
					"jsdoc-js/no-blank-block-descriptions": "warn",
					"jsdoc-js/no-blank-blocks": "warn",
					"jsdoc-js/no-multi-asterisks": "warn",
					"jsdoc-js/require-asterisk-prefix": "warn",
					"jsdoc-js/require-hyphen-before-param-description": "warn",
				}
			: {}),
	} satisfies JsPluginRules;

	return [
		{
			name: "isentinel/oxlint/jsdoc",
			files: [GLOB_SRC],
			plugins: ["jsdoc"],
			rules: nativeRules,
		},
		{
			name: "isentinel/oxlint/jsdoc/js-plugin",
			files: [GLOB_SRC],
			jsPlugins: [
				{
					name: "jsdoc-js",
					specifier: "eslint-plugin-jsdoc",
				},
			],
			rules: jsPluginRules,
		},
	];
}
