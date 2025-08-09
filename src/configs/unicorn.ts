import { GLOB_ROOT } from "../globs";
import type { OptionsStylistic, TypedFlatConfigItem } from "../types";
import { interopDefault } from "../utils";

/* eslint-disable @cspell/spellchecker -- Used to correct abbreviations. */
const abbreviations = {
	args: false,
	dist: {
		distance: true,
	},
	e: false,
	err: false,
	fn: {
		func: true,
		function: false,
	},
	func: false,
	inst: {
		instance: true,
	},
	jsdoc: false,
	nums: {
		numbers: true,
	},
	pos: {
		position: true,
	},
	props: false,
	ref: false,
	refs: false,
	str: false,
	util: false,
	utils: false,
} as const;
/* eslint-enable @cspell/spellchecker */

export async function unicorn(options: OptionsStylistic = {}): Promise<Array<TypedFlatConfigItem>> {
	const { stylistic = true } = options;

	const pluginUnicorn = await interopDefault(import("eslint-plugin-unicorn"));

	return [
		{
			name: "isentinel/unicorn",
			plugins: {
				unicorn: pluginUnicorn,
			},
			rules: {
				"unicorn/catch-error-name": [
					"error",
					{
						name: "err",
					},
				],
				"unicorn/consistent-destructuring": "error",
				"unicorn/consistent-function-scoping": ["error", { checkArrowFunctions: false }],
				"unicorn/error-message": "off",
				"unicorn/filename-case": [
					"error",
					{
						case: "kebabCase",
						ignore: ["^[A-Z0-9]+\.md$"],
						multipleFileExtensions: true,
					},
				],
				"unicorn/no-array-for-each": "error",
				"unicorn/no-array-push-push": "error",
				"unicorn/no-await-expression-member": "error",
				"unicorn/no-empty-file": "error",
				"unicorn/no-for-loop": "error",
				"unicorn/no-keyword-prefix": "error",
				"unicorn/no-lonely-if": "error",
				"unicorn/no-negated-condition": "off",
				"unicorn/no-negation-in-equality-check": "error",
				"unicorn/no-object-as-default-parameter": "error",
				"unicorn/no-static-only-class": "error",
				"unicorn/no-unreadable-array-destructuring": "error",
				"unicorn/no-unused-properties": "error",
				"unicorn/no-useless-promise-resolve-reject": "error",
				"unicorn/no-useless-spread": "off",
				"unicorn/no-useless-undefined": ["error", { checkArguments: false }],
				"unicorn/number-literal-case": "error",
				"unicorn/prefer-default-parameters": "error",
				"unicorn/prefer-export-from": "error",
				"unicorn/prefer-includes": "error",
				"unicorn/prefer-logical-operator-over-ternary": "error",
				"unicorn/prefer-math-min-max": "off",
				"unicorn/prefer-optional-catch-binding": "error",
				"unicorn/prefer-set-has": "error",
				"unicorn/prefer-switch": "error",
				"unicorn/prefer-ternary": ["error", "only-single-line"],
				"unicorn/prevent-abbreviations": [
					"error",
					{
						checkFilenames: true,
						replacements: abbreviations,
					},
				],

				"unicorn/throw-new-error": "off",

				...(stylistic
					? {
							"unicorn/switch-case-braces": "error",
						}
					: {}),
			},
		},
		{
			files: [GLOB_ROOT],
			name: "isentinel/unicorn/root",
			rules: {
				"unicorn/prevent-abbreviations": [
					"error",
					{
						checkFilenames: false,
						replacements: abbreviations,
					},
				],
			},
		},
	];
}
