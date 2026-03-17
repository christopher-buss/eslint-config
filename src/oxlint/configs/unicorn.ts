import { GLOB_ROOT, GLOB_SRC } from "../../globs.ts";
import { mergeGlobs } from "../../utils.ts";
import type {
	JsPluginRules,
	OptionsStylistic,
	OxlintRules,
	TypedOxlintConfigItem,
} from "../types.ts";

/* eslint-disable @cspell/spellchecker -- Used to correct abbreviations. */
const abbreviations = {
	args: false,
	ctx: false,
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

export function oxlintUnicorn(
	options: OptionsStylistic & { root?: Array<string> } = {},
): Array<TypedOxlintConfigItem> {
	const { root: customRootGlobs, stylistic } = options;

	const rootGlobs = mergeGlobs(GLOB_ROOT, customRootGlobs);

	const nativeRules = {
		"unicorn/catch-error-name": [
			"error",
			{
				name: "err",
			},
		],
		"unicorn/consistent-function-scoping": ["error", { checkArrowFunctions: false }],
		"unicorn/error-message": "off",
		"unicorn/filename-case": [
			"error",
			{
				case: "kebabCase",
				ignore: ["^[A-Z0-9]+\\.md$"],
				multipleFileExtensions: true,
			},
		],
		"unicorn/no-array-for-each": "error",
		"unicorn/no-await-expression-member": "error",
		"unicorn/no-empty-file": "error",
		"unicorn/no-immediate-mutation": "error",
		"unicorn/no-lonely-if": "error",
		"unicorn/no-negation-in-equality-check": "error",
		"unicorn/no-object-as-default-parameter": "error",
		"unicorn/no-single-promise-in-promise-methods": "error",
		"unicorn/no-static-only-class": "error",
		"unicorn/no-unreadable-array-destructuring": "error",
		"unicorn/no-useless-collection-argument": "error",
		"unicorn/no-useless-promise-resolve-reject": "error",
		"unicorn/no-useless-spread": "off",
		"unicorn/no-useless-undefined": ["error", { checkArguments: false }],
		"unicorn/number-literal-case": "error",
		"unicorn/prefer-default-parameters": "error",
		"unicorn/prefer-includes": "error",
		"unicorn/prefer-logical-operator-over-ternary": "error",
		"unicorn/prefer-math-min-max": "off",
		"unicorn/prefer-optional-catch-binding": "error",
		"unicorn/prefer-set-has": "error",
		"unicorn/prefer-ternary": ["error", "only-single-line"],
		"unicorn/throw-new-error": "off",

		...(stylistic !== false
			? {
					"unicorn/switch-case-braces": "error",
				}
			: {}),
	} satisfies OxlintRules;

	// Rules not yet native to oxlint.
	const jsPluginRules = {
		"unicorn-js/consistent-destructuring": "error",
		"unicorn-js/no-keyword-prefix": "error",
		"unicorn-js/no-negated-condition": "off",
		"unicorn-js/no-unused-properties": "error",
		"unicorn-js/prefer-export-from": "error",
		"unicorn-js/prefer-single-call": "error",
		"unicorn-js/prefer-switch": "error",
		"unicorn-js/prevent-abbreviations": [
			"error",
			{
				checkFilenames: true,
				replacements: abbreviations,
			},
		],
	} satisfies JsPluginRules;

	return [
		{
			name: "isentinel/unicorn",
			files: [GLOB_SRC],
			plugins: ["unicorn"],
			rules: nativeRules,
		},
		{
			name: "isentinel/unicorn/js-plugin",
			files: [GLOB_SRC],
			jsPlugins: [
				{
					name: "unicorn-js",
					specifier: "eslint-plugin-unicorn",
				},
			],
			rules: jsPluginRules,
		},
		{
			name: "isentinel/unicorn/root",
			files: rootGlobs,
			jsPlugins: [
				{
					name: "unicorn-js",
					specifier: "eslint-plugin-unicorn",
				},
			],
			rules: {
				"unicorn-js/prevent-abbreviations": [
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
