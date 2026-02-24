import { GLOB_SRC } from "../globs.ts";
import type {
	JsdocOptions,
	OptionsProjectType,
	OptionsStylistic,
	Rules,
	TypedFlatConfigItem,
	TypedOxlintConfigItem,
} from "../types.ts";
import { interopDefault } from "../utils.ts";

type JsdocConfigOptions = JsdocOptions & OptionsProjectType & OptionsStylistic;

export function jsdocRules(options: JsdocConfigOptions = {}): Rules {
	const isPackage = options.type === "package";

	return {
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

		...(options.stylistic !== false
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
	};
}

export function oxlintJsdoc(options: JsdocConfigOptions = {}): Array<TypedOxlintConfigItem> {
	const { full = false, stylistic = true, type = "game" } = options;

	const allRules = jsdocRules({
		stylistic,
		type: full ? "package" : type,
	});

	// Won't implement — experimental rule (oxc-project/oxc#1141)
	// jsdoc/convert-to-jsdoc-comments

	// TODO(oxlint): not yet implemented (oxc-project/oxc#1141)
	// check-param-names, check-types, informative-docs, no-types,
	// no-undefined-types, require-description,
	// require-description-complete-sentence, require-rejects,
	// require-returns-check, require-yields-check, check-alignment,
	// multiline-blocks, no-blank-block-descriptions, no-blank-blocks,
	// no-multi-asterisks, require-asterisk-prefix,
	// require-hyphen-before-param-description
	const omitRules = new Set([
		"jsdoc/check-alignment",
		"jsdoc/check-param-names",
		"jsdoc/check-types",
		"jsdoc/convert-to-jsdoc-comments",
		"jsdoc/informative-docs",
		"jsdoc/multiline-blocks",
		"jsdoc/no-blank-block-descriptions",
		"jsdoc/no-blank-blocks",
		"jsdoc/no-multi-asterisks",
		"jsdoc/no-types",
		"jsdoc/no-undefined-types",
		"jsdoc/require-asterisk-prefix",
		"jsdoc/require-description",
		"jsdoc/require-description-complete-sentence",
		"jsdoc/require-hyphen-before-param-description",
		"jsdoc/require-rejects",
		"jsdoc/require-returns-check",
		"jsdoc/require-yields-check",
	]);

	const filteredRules: Rules = {};
	for (const [key, value] of Object.entries(allRules)) {
		if (!omitRules.has(key)) {
			filteredRules[key] = value;
		}
	}

	return [
		{
			name: "isentinel/jsdoc",
			files: [GLOB_SRC],
			plugins: ["jsdoc"],
			rules: filteredRules,
		},
	];
}

export async function jsdoc(options: JsdocConfigOptions = {}): Promise<Array<TypedFlatConfigItem>> {
	const { full = false, stylistic = true, type = "game" } = options;

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
				...jsdocRules({
					stylistic,
					type: full ? "package" : type,
				}),
			},
		},
	];
}
