import { GLOB_SRC } from "../../globs.ts";
import type { OptionsStylistic, Rules, TypedOxlintConfigItem } from "../types.ts";

export function oxlintUnicorn(
	options: OptionsStylistic & { root?: Array<string> } = {},
): Array<TypedOxlintConfigItem> {
	const { stylistic } = options;

	// Inlined from unicornRules(), with unsupported rules omitted.
	//
	// Won't implement — use typescript/prefer-for-of instead
	// (oxc-project/oxc#684, #11311) no-for-loop: suggests Array.prototype.entries
	// which is slow
	//
	// TODO(oxlint): not yet implemented (oxc-project/oxc#684)
	// consistent-destructuring, no-keyword-prefix, no-unused-properties,
	// prefer-export-from, prefer-single-call, prefer-switch,
	// prefer-ternary, prevent-abbreviations

	const rules: Rules = {
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
		"unicorn/no-negated-condition": "off",
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
		"unicorn/throw-new-error": "off",

		...(stylistic !== false
			? {
					"unicorn/switch-case-braces": "error",
				}
			: {}),
	};

	return [
		{
			name: "isentinel/unicorn",
			files: [GLOB_SRC],
			plugins: ["unicorn"],
			rules,
		},
	];
}
