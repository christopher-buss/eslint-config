import { GLOB_SRC } from "../../globs.ts";
import type {
	JsdocOptions,
	OptionsProjectType,
	OptionsStylistic,
	Rules,
	TypedOxlintConfigItem,
} from "../../types.ts";

type JsdocConfigOptions = JsdocOptions & OptionsProjectType & OptionsStylistic;

export function oxlintJsdoc(options: JsdocConfigOptions = {}): Array<TypedOxlintConfigItem> {
	const { full = false, stylistic: _stylistic = true, type = "game" } = options;
	const isPackage = full || type === "package";

	// Inlined from jsdocRules(), with unsupported rules omitted.
	//
	// Won't implement — experimental rule (oxc-project/oxc#1141)
	// jsdoc/convert-to-jsdoc-comments
	//
	// TODO(oxlint): not yet implemented (oxc-project/oxc#1141)
	// check-param-names, check-types, informative-docs, no-types,
	// no-undefined-types, require-description,
	// require-description-complete-sentence, require-rejects,
	// require-returns-check, require-yields-check, check-alignment,
	// multiline-blocks, no-blank-block-descriptions, no-blank-blocks,
	// no-multi-asterisks, require-asterisk-prefix,
	// require-hyphen-before-param-description

	const rules: Rules = {
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
	};

	return [
		{
			name: "isentinel/jsdoc",
			files: [GLOB_SRC],
			plugins: ["jsdoc"],
			rules,
		},
	];
}
