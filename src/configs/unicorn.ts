import { GLOB_ROOT, GLOB_SRC } from "../globs.ts";
import type {
	OptionsStylistic,
	Rules,
	TypedFlatConfigItem,
	TypedOxlintConfigItem,
} from "../types.ts";
import { interopDefault, mergeGlobs } from "../utils.ts";

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

export function unicornRules(options: OptionsStylistic = {}): Rules {
	const { stylistic } = options;

	return {
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
		"unicorn/no-await-expression-member": "error",
		"unicorn/no-empty-file": "error",
		"unicorn/no-for-loop": "error",
		"unicorn/no-immediate-mutation": "error",
		"unicorn/no-keyword-prefix": "error",
		"unicorn/no-lonely-if": "error",
		"unicorn/no-negated-condition": "off",
		"unicorn/no-negation-in-equality-check": "error",
		"unicorn/no-object-as-default-parameter": "error",
		"unicorn/no-single-promise-in-promise-methods": "error",
		"unicorn/no-static-only-class": "error",
		"unicorn/no-unreadable-array-destructuring": "error",
		"unicorn/no-unused-properties": "error",
		"unicorn/no-useless-collection-argument": "error",
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
		"unicorn/prefer-single-call": "error",
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

		...(stylistic !== false
			? {
					"unicorn/switch-case-braces": "error",
				}
			: {}),
	};
}

export function oxlintUnicorn(
	options: OptionsStylistic & { root?: Array<string> } = {},
): Array<TypedOxlintConfigItem> {
	const allRules = unicornRules(options);

	// Won't implement — use typescript/prefer-for-of instead
	// (oxc-project/oxc#684, #11311) no-for-loop: suggests Array.prototype.entries
	// which is slow

	// TODO(oxlint): not yet implemented (oxc-project/oxc#684)
	// consistent-destructuring, no-keyword-prefix, no-unused-properties,
	// prefer-export-from, prefer-single-call, prefer-switch,
	// prefer-ternary, prevent-abbreviations
	const omitRules = new Set([
		"unicorn/consistent-destructuring",
		"unicorn/no-for-loop",
		"unicorn/no-keyword-prefix",
		"unicorn/no-unused-properties",
		"unicorn/prefer-export-from",
		"unicorn/prefer-single-call",
		"unicorn/prefer-switch",
		"unicorn/prefer-ternary",
		"unicorn/prevent-abbreviations",
	]);

	const filteredRules: Rules = {};
	for (const [key, value] of Object.entries(allRules)) {
		if (!omitRules.has(key)) {
			filteredRules[key] = value;
		}
	}

	return [
		{
			name: "isentinel/unicorn",
			files: [GLOB_SRC],
			plugins: ["unicorn"],
			rules: filteredRules,
		},
	];
}

export async function unicorn(
	options: OptionsStylistic & { root?: Array<string> } = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { root: customRootGlobs, stylistic = true } = options;

	const pluginUnicorn = await interopDefault(import("eslint-plugin-unicorn"));
	const rootGlobs = mergeGlobs(GLOB_ROOT, customRootGlobs);

	return [
		{
			name: "isentinel/unicorn/setup",
			plugins: {
				unicorn: pluginUnicorn,
			},
		},
		{
			name: "isentinel/unicorn",
			files: [GLOB_SRC],

			rules: unicornRules({ stylistic }),
		},
		{
			// TODO: Implement in oxc
			name: "isentinel/unicorn/root",
			files: rootGlobs,
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
