import { GLOB_SRC } from "../globs";
import type {
	JsdocOptions,
	OptionsProjectType,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types";
import { interopDefault } from "../utils";

export async function jsdoc(
	options: JsdocOptions & OptionsProjectType & OptionsStylistic = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { full = false, stylistic = true, type = "game" } = options;

	const isPackage = type === "package" || full;

	const pluginJsdoc = await interopDefault(import("eslint-plugin-jsdoc"));

	return [
		{
			name: "isentinel/jsdoc/setup",
			plugins: {
				jsdoc: pluginJsdoc,
			},
		},
		{
			name: "isentinel/jsdoc",
			files: [GLOB_SRC],
			rules: {
				"jsdoc/check-access": "warn",
				"jsdoc/check-param-names": ["warn", { checkDestructured: false }],
				"jsdoc/check-property-names": "warn",
				"jsdoc/check-types": "warn",
				"jsdoc/empty-tags": "warn",
				"jsdoc/implements-on-classes": "warn",
				"jsdoc/informative-docs": "warn",
				"jsdoc/no-defaults": "warn",
				"jsdoc/no-types": "warn",
				"jsdoc/no-undefined-types": "error",
				"jsdoc/require-description": [
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
				"jsdoc/require-description-complete-sentence": "warn",
				"jsdoc/require-param-description": "warn",
				"jsdoc/require-param-name": "warn",
				"jsdoc/require-property": "warn",
				"jsdoc/require-property-description": "warn",
				"jsdoc/require-property-name": "warn",
				"jsdoc/require-rejects": "error",
				"jsdoc/require-returns-check": "warn",
				"jsdoc/require-returns-description": "warn",
				"jsdoc/require-yields-check": "warn",
				"jsdoc/sort-tags": "off",

				...(isPackage
					? {
							"jsdoc/require-param": [
								"warn",
								{ checkDestructured: false, exemptedBy: ["ignore"] },
							],
							"jsdoc/require-returns": ["warn", { exemptedBy: ["hidden"] }],
							"jsdoc/require-template": "warn",
						}
					: {}),

				...(stylistic !== false
					? {
							"jsdoc/check-alignment": "warn",
							"jsdoc/convert-to-jsdoc-comments": "warn",
							"jsdoc/multiline-blocks": "warn",
							"jsdoc/no-blank-block-descriptions": "warn",
							"jsdoc/no-blank-blocks": "warn",
							"jsdoc/no-multi-asterisks": "warn",
							"jsdoc/require-asterisk-prefix": "warn",
							"jsdoc/require-hyphen-before-param-description": "warn",
						}
					: {}),
			},
		},
	];
}
