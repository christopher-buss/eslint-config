import type {
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";

/**
 * Core JavaScript rules shared between the ESLint and oxlint factories.
 *
 * Rule names use the canonical (renamed) ESLint prefixes. The oxlint factory
 * translates names via the oxlint rule mapping.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function javascriptRules({
	isInEditor = false,
	roblox = true,
	stylistic = true,
}: OptionsHasRoblox & OptionsIsInEditor & OptionsStylistic = {}): TypedFlatConfigItem["rules"] {
	return {
		"accessor-pairs": ["error", { enforceForClassMembers: true, setWithoutGet: true }],

		"antfu/no-top-level-await": "error",

		"array-callback-return": [
			"error",
			{
				allowImplicit: true,
			},
		],

		"better-max-params/better-max-params": [
			"error",
			{
				func: 4,
			},
		],
		"block-scoped-var": "error",

		"constructor-super": "error",

		"de-morgan/no-negated-conjunction": "error",
		"de-morgan/no-negated-disjunction": "error",
		"default-case-last": "error",
		"dot-notation": ["error", { allowKeywords: true }],
		"eqeqeq": "error",
		"for-direction": "error",
		"logical-assignment-operators": "error",
		"max-classes-per-file": "error",
		"max-depth": "error",
		"new-cap": [
			"error",
			{
				capIsNew: false,
				// oxlint-disable-next-line unicorn-js/no-keyword-prefix -- External
				newIsCap: true,
				// oxlint-disable-next-line unicorn-js/no-keyword-prefix -- External
				newIsCapExceptionPattern: "^mock",
				properties: true,
			},
		],
		"no-alert": "error",
		"no-array-constructor": "error",
		"no-async-promise-executor": "error",
		"no-caller": "error",
		"no-case-declarations": "error",
		"no-class-assign": "error",
		"no-compare-neg-zero": "error",
		"no-cond-assign": ["error", "always"],
		"no-console": ["error", { allow: ["warn", "error"] }],
		"no-const-assign": "error",
		"no-constant-condition": [
			"error",
			{
				checkLoops: false,
			},
		],
		"no-control-regex": "error",
		"no-debugger": "error",
		"no-delete-var": "error",
		"no-dupe-args": "error",
		"no-dupe-class-members": "error",
		"no-dupe-keys": "error",
		"no-duplicate-case": "error",
		"no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
		"no-else-return": ["error", { allowElseIf: false }],
		"no-empty": ["error", { allowEmptyCatch: true }],
		"no-empty-character-class": "error",
		"no-empty-function": "error",
		"no-empty-pattern": "error",
		"no-empty-static-block": "error",
		"no-eval": "error",
		"no-ex-assign": "error",
		"no-extend-native": "error",
		"no-extra-bind": "error",
		"no-extra-boolean-cast": "error",
		"no-fallthrough": "error",
		"no-func-assign": "error",
		"no-global-assign": "error",
		"no-implied-eval": "error",
		"no-import-assign": "error",
		"no-invalid-regexp": "error",
		"no-irregular-whitespace": "error",
		"no-iterator": "error",
		"no-labels": ["error", { allowLoop: false, allowSwitch: false }],
		"no-lonely-if": "error",
		"no-loop-func": "error",
		"no-loss-of-precision": "error",
		"no-misleading-character-class": "error",
		"no-new": "error",
		"no-new-func": "error",
		"no-new-native-nonconstructor": "error",
		"no-new-wrappers": "error",
		"no-obj-calls": "error",
		"no-octal": "error",
		"no-octal-escape": "error",
		"no-proto": "error",
		"no-prototype-builtins": "error",
		"no-redeclare": ["error", { builtinGlobals: false }],
		"no-regex-spaces": "error",
		"no-restricted-globals": [
			"error",
			{ name: "global", message: "Use `globalThis` instead." },
			{ name: "self", message: "Use `globalThis` instead." },
		],
		"no-restricted-properties": [
			"error",
			{
				message: "Use `Object.getPrototypeOf` or `Object.setPrototypeOf` instead.",
				property: "__proto__",
			},
			{
				message: "Use `Object.defineProperty` instead.",
				property: "__defineGetter__",
			},
			{
				message: "Use `Object.defineProperty` instead.",
				property: "__defineSetter__",
			},
			{
				message: "Use `Object.getOwnPropertyDescriptor` instead.",
				property: "__lookupGetter__",
			},
			{
				message: "Use `Object.getOwnPropertyDescriptor` instead.",
				property: "__lookupSetter__",
			},
		],
		"no-restricted-syntax": ["error", "TSEnumDeclaration[const=true]", "TSExportAssignment"],
		"no-return-assign": ["error", "always"],
		"no-self-assign": ["error", { props: true }],
		"no-self-compare": "error",
		"no-sequences": "error",
		"no-shadow-restricted-names": "error",
		"no-sparse-arrays": "error",
		"no-template-curly-in-string": "error",
		"no-this-before-super": "error",
		"no-throw-literal": "error",
		"no-undef": "error",
		"no-undef-init": "error",
		"no-unexpected-multiline": "error",
		"no-unmodified-loop-condition": "error",
		"no-unneeded-ternary": ["error", { defaultAssignment: false }],
		"no-unreachable": "error",
		"no-unreachable-loop": "error",
		"no-unsafe-finally": "error",
		"no-unsafe-negation": "error",
		"no-unused-expressions": [
			"error",
			{
				allowShortCircuit: true,
				allowTaggedTemplates: true,
				allowTernary: true,
			},
		],
		"no-unused-vars": "off",
		"no-use-before-define": ["error", { classes: false, functions: false, variables: true }],
		"no-useless-backreference": "error",
		"no-useless-call": "error",
		"no-useless-catch": "error",
		"no-useless-computed-key": "error",
		"no-useless-constructor": "error",
		"no-useless-rename": "error",
		"no-useless-return": "error",
		"no-var": "error",
		"no-with": "error",
		"prefer-arrow-callback": [
			"error",
			{
				allowNamedFunctions: false,
				allowUnboundThis: true,
			},
		],
		"prefer-const": [
			isInEditor ? "warn" : "error",
			{
				destructuring: "all",
				ignoreReadBeforeAssign: true,
			},
		],
		"prefer-exponentiation-operator": "error",
		"prefer-promise-reject-errors": "error",
		// regex-literals not supported in roblox-ts
		"prefer-regex-literals": roblox ? "off" : ["error", { disallowRedundantWrapping: true }],
		"prefer-rest-params": "error",
		"prefer-spread": "error",
		"prefer-template": "error",
		"symbol-description": "error",
		"unicode-bom": ["error", "never"],
		"unused-imports/no-unused-imports": isInEditor ? "warn" : "error",
		"unused-imports/no-unused-vars": [
			"error",
			{
				args: "all",
				argsIgnorePattern: "^_+",
				caughtErrors: "all",
				caughtErrorsIgnorePattern: "^_+",
				destructuredArrayIgnorePattern: "^_+",
				ignoreRestSiblings: true,
				reportUsedIgnorePattern: true,
				vars: "all",
				varsIgnorePattern: "^_+",
			},
		],
		"use-isnan": ["error", { enforceForIndexOf: true, enforceForSwitchCase: true }],
		"valid-typeof": ["error", { requireStringLiterals: true }],
		"vars-on-top": "error",

		...(stylistic !== false
			? {
					"id-length": [
						"error",
						{
							exceptions: ["_", "x", "y", "z", "a", "b", "e"],
							max: 30,
							min: 2,
							properties: "never",
						},
					],
					"max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
					"no-lone-blocks": "error",
					"no-multi-str": "error",
					// "object-shorthand": "error",
					"object-shorthand": [
						"error",
						"always",
						{
							avoidQuotes: true,
							ignoreConstructors: false,
						},
					],
					"one-var": ["error", { initialized: "never" }],

					"yoda": ["error", "never"],

					...(!roblox
						? {
								"func-style": ["error", "declaration"],
							}
						: {}),
				}
			: {}),
	};
}
