import type { OptionsHasRoblox, OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

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

export type UnicornNameReplacements = Record<string, false | Readonly<Record<string, boolean>>>;

/**
 * Resolve the `unicorn/name-replacements` replacement map.
 *
 * @param options - Shared rule options.
 * @returns The merged replacements map.
 */
export function unicornNameReplacements({
	nameReplacements,
	roblox = true,
}: OptionsHasRoblox & {
	nameReplacements?: UnicornNameReplacements;
} = {}): UnicornNameReplacements {
	return {
		...abbreviations,
		...(roblox ? { buf: false } : {}),
		...nameReplacements,
	};
}

/**
 * Unicorn rules shared between the ESLint and oxlint factories.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function unicornRules(
	options: OptionsHasRoblox &
		OptionsStylistic & { nameReplacements?: UnicornNameReplacements } = {},
): TypedFlatConfigItem["rules"] {
	const { roblox = true, stylistic = true } = options;

	const replacements = unicornNameReplacements(options);

	return {
		"unicorn/catch-error-name": [
			"error",
			{
				name: "err",
			},
		],
		"unicorn/consistent-conditional-object-spread": ["error", "ternary"],
		"unicorn/consistent-destructuring": "error",
		"unicorn/consistent-function-scoping": ["error", { checkArrowFunctions: false }],
		"unicorn/consistent-json-file-read": "error",
		"unicorn/consistent-template-literal-escape": "error",
		"unicorn/consistent-tuple-labels": "error",
		"unicorn/error-message": "off",
		"unicorn/filename-case": [
			"error",
			{
				case: "kebabCase",
				ignore: ["^[A-Z0-9]+\.md$"],
				multipleFileExtensions: true,
			},
		],
		"unicorn/isolated-functions": "error",
		"unicorn/name-replacements": [
			"error",
			{
				checkFilenames: true,
				replacements,
			},
		],
		"unicorn/no-array-sort-for-min-max": "error",
		"unicorn/no-async-promise-finally": "error",
		"unicorn/no-await-expression-member": "error",
		"unicorn/no-break-in-nested-loop": "error",
		"unicorn/no-constant-zero-expression": "error",
		"unicorn/no-declarations-before-early-exit": "error",
		"unicorn/no-double-comparison": "error",
		"unicorn/no-duplicate-loops": "error",
		"unicorn/no-duplicate-set-values": "error",
		"unicorn/no-empty-file": "error",
		"unicorn/no-exports-in-scripts": "error",
		"unicorn/no-for-each": "error",
		"unicorn/no-for-loop": "error",
		"unicorn/no-immediate-mutation": "error",
		"unicorn/no-incorrect-template-string-interpolation": "error",
		"unicorn/no-invalid-well-known-symbol-methods": "error",
		"unicorn/no-keyword-prefix": "error",
		"unicorn/no-lonely-if": "error",
		"unicorn/no-loop-iterable-mutation": "error",
		"unicorn/no-mismatched-map-key": "error",
		"unicorn/no-misrefactored-assignment": "error",
		"unicorn/no-negated-array-predicate": "error",
		"unicorn/no-negated-condition": "off",
		"unicorn/no-negation-in-equality-check": "error",
		"unicorn/no-non-function-verb-prefix": "error",
		"unicorn/no-object-as-default-parameter": "error",
		"unicorn/no-optional-chaining-on-undeclared-variable": "error",
		"unicorn/no-redundant-comparison": "error",
		"unicorn/no-return-array-push": "error",
		"unicorn/no-single-promise-in-promise-methods": "error",
		"unicorn/no-static-only-class": "error",
		"unicorn/no-subtraction-comparison": "error",
		"unicorn/no-unreadable-array-destructuring": "error",
		"unicorn/no-unreadable-for-of-expression": "error",
		"unicorn/no-unreadable-new-expression": "error",
		"unicorn/no-unsafe-property-key": "error",
		"unicorn/no-unused-properties": "error",
		"unicorn/no-useless-collection-argument": "error",
		"unicorn/no-useless-compound-assignment": "error",
		"unicorn/no-useless-concat": "error",
		"unicorn/no-useless-delete-check": "error",
		"unicorn/no-useless-logical-operand": "error",
		"unicorn/no-useless-promise-resolve-reject": "error",
		"unicorn/no-useless-recursion": "error",
		"unicorn/no-useless-spread": "off",
		"unicorn/no-useless-undefined": ["error", { checkArguments: false }],
		"unicorn/number-literal-case": "error",
		"unicorn/operator-assignment": "error",
		"unicorn/prefer-continue": "error",
		"unicorn/prefer-default-parameters": "error",
		"unicorn/prefer-direct-iteration": "error",
		"unicorn/prefer-else-if": "error",
		"unicorn/prefer-export-from": "error",
		"unicorn/prefer-has-check": "error",
		"unicorn/prefer-hoisting-branch-code": "error",
		"unicorn/prefer-identifier-import-export-specifiers": "error",
		"unicorn/prefer-includes": "error",
		"unicorn/prefer-logical-operator-over-ternary": "error",
		"unicorn/prefer-math-min-max": "off",
		"unicorn/prefer-optional-catch-binding": "error",
		"unicorn/prefer-set-has": "error",
		"unicorn/prefer-simple-condition-first": "error",
		"unicorn/prefer-simplified-conditions": "error",
		"unicorn/prefer-single-call": "error",
		"unicorn/prefer-switch": "error",
		"unicorn/prefer-ternary": ["error", "only-single-line"],
		"unicorn/prefer-unary-minus": "error",

		...(stylistic !== false
			? {
					"unicorn/consistent-compound-words": "error",
					"unicorn/prefer-block-statement-over-iife": "error",
					"unicorn/switch-case-braces": "error",
				}
			: {}),

		...(!roblox
			? {
					"unicorn/no-accidental-bitwise-operator": "error",
					"unicorn/no-array-concat-in-loop": "error",
					"unicorn/no-array-fill-with-reference-type": "error",
					"unicorn/no-boolean-sort-comparator": "error",
					"unicorn/no-confusing-array-splice": "error",
					"unicorn/no-error-property-assignment": "error",
					"unicorn/no-global-object-property-assignment": "error",
					"unicorn/no-impossible-length-comparison": "error",
					"unicorn/no-invalid-character-comparison": "error",
					"unicorn/no-object-methods-with-collections": "error",
					"unicorn/no-unnecessary-fetch-options": "error",
					"unicorn/no-unnecessary-global-this": "error",
					"unicorn/no-unsafe-string-replacement": "error",
					"unicorn/no-useless-coercion": "error",
					"unicorn/no-useless-iterator-to-array": "error",
					"unicorn/no-xor-as-exponentiation": "error",
					"unicorn/prefer-abort-signal-any": "error",
					"unicorn/prefer-array-flat-map": "error",
					"unicorn/prefer-array-from-map": "error",
					"unicorn/prefer-array-from-range": "error",
					"unicorn/prefer-array-iterable-methods": "error",
					"unicorn/prefer-array-slice": "error",
					"unicorn/prefer-flat-math-min-max": "error",
					"unicorn/prefer-global-number-constants": "error",
					"unicorn/prefer-group-by": "error",
					"unicorn/prefer-iterator-helpers": "error",
					"unicorn/prefer-math-constants": "error",
					"unicorn/prefer-split-limit": "error",
					"unicorn/prefer-string-match-all": "error",
					"unicorn/prefer-string-pad-start-end": "error",
					"unicorn/prefer-string-repeat": "error",
					"unicorn/require-passive-events": "error",
					"unicorn/throw-new-error": "error",
				}
			: {}),
	};
}

/**
 * Root-level unicorn rules shared between the ESLint and oxlint factories.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function unicornRootRules(
	options: OptionsHasRoblox & { nameReplacements?: UnicornNameReplacements } = {},
): TypedFlatConfigItem["rules"] {
	const replacements = unicornNameReplacements(options);

	return {
		"unicorn/name-replacements": [
			"error",
			{
				checkFilenames: false,
				replacements,
			},
		],
	};
}
