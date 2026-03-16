import globals from "globals";

import { GLOB_SRC } from "../../globs.ts";
import type { Rules, TypedOxlintConfigItem } from "../types.ts";

export function oxlintJavascript(options: {
	isInEditor: boolean;
	roblox: boolean;
	stylistic: boolean | object;
}): Array<TypedOxlintConfigItem> {
	const { isInEditor, roblox, stylistic } = options;

	// Inlined from javascriptRules(), with prefixes transformed for oxlint:
	// - unprefixed core rules → eslint/
	// - plugin-prefixed rules kept as-is (jsPlugin rules)
	//
	// Won't implement (covered elsewhere or unsupported):
	// dot-notation, no-dupe-args, no-octal, no-octal-escape,
	// no-restricted-properties, no-restricted-syntax, no-undef-init
	//
	// TODO(oxlint): not yet implemented (oxc-project/oxc#479)
	// logical-assignment-operators, no-implied-eval, no-unreachable-loop,
	// object-shorthand, one-var, prefer-arrow-callback
	//
	// TODO: implemented but different behavior (oxc-project/oxc#19617)
	// id-length — lints on generics

	const rules: Rules = {
		"antfu/no-top-level-await": "error",

		"better-max-params/better-max-params": [
			"error",
			{
				func: 4,
			},
		],

		"de-morgan/no-negated-conjunction": "error",

		"de-morgan/no-negated-disjunction": "error",
		"eslint/accessor-pairs": ["error", { enforceForClassMembers: true, setWithoutGet: true }],

		"eslint/array-callback-return": [
			"error",
			{
				allowImplicit: true,
			},
		],

		"eslint/block-scoped-var": "error",
		"eslint/constructor-super": "error",
		"eslint/default-case-last": "error",
		"eslint/eqeqeq": "error",

		"eslint/for-direction": "error",
		"eslint/max-classes-per-file": "error",
		"eslint/max-depth": "error",

		"eslint/new-cap": [
			"error",
			{
				capIsNew: false,
				// eslint-disable-next-line unicorn/no-keyword-prefix -- External
				newIsCap: true,
				// eslint-disable-next-line unicorn/no-keyword-prefix -- External
				newIsCapExceptionPattern: "^mock",
				properties: true,
			},
		],
		"eslint/no-alert": "error",
		"eslint/no-array-constructor": "error",
		"eslint/no-async-promise-executor": "error",
		"eslint/no-caller": "error",
		"eslint/no-case-declarations": "error",
		"eslint/no-class-assign": "error",
		"eslint/no-compare-neg-zero": "error",
		"eslint/no-cond-assign": ["error", "always"],
		"eslint/no-console": ["error", { allow: ["warn", "error"] }],
		"eslint/no-const-assign": "error",
		"eslint/no-constant-condition": [
			"error",
			{
				checkLoops: false,
			},
		],
		"eslint/no-control-regex": "error",
		"eslint/no-debugger": "error",
		"eslint/no-delete-var": "error",
		"eslint/no-dupe-class-members": "error",
		"eslint/no-dupe-keys": "error",
		"eslint/no-duplicate-case": "error",
		"eslint/no-else-return": ["error", { allowElseIf: false }],
		"eslint/no-empty": ["error", { allowEmptyCatch: true }],
		"eslint/no-empty-character-class": "error",
		"eslint/no-empty-function": "error",
		"eslint/no-empty-pattern": "error",
		"eslint/no-empty-static-block": "error",
		"eslint/no-eval": "error",
		"eslint/no-ex-assign": "error",
		"eslint/no-extend-native": "error",
		"eslint/no-extra-bind": "error",
		"eslint/no-extra-boolean-cast": "error",
		"eslint/no-fallthrough": "error",
		"eslint/no-func-assign": "error",
		"eslint/no-global-assign": "error",
		"eslint/no-import-assign": "error",
		"eslint/no-invalid-regexp": "error",
		"eslint/no-irregular-whitespace": "error",
		"eslint/no-iterator": "error",
		"eslint/no-labels": ["error", { allowLoop: false, allowSwitch: false }],
		"eslint/no-lonely-if": "error",
		"eslint/no-loss-of-precision": "error",
		"eslint/no-misleading-character-class": "error",
		"eslint/no-new": "error",
		"eslint/no-new-func": "error",
		"eslint/no-new-native-nonconstructor": "error",
		"eslint/no-new-wrappers": "error",
		"eslint/no-obj-calls": "error",
		"eslint/no-prototype-builtins": "error",
		"eslint/no-redeclare": ["error", { builtinGlobals: false }],
		"eslint/no-regex-spaces": "error",
		"eslint/no-restricted-globals": [
			"error",
			{ name: "global", message: "Use `globalThis` instead." },
			{ name: "self", message: "Use `globalThis` instead." },
		],
		"eslint/no-return-assign": ["error", "always"],
		"eslint/no-self-assign": ["error", { props: true }],
		"eslint/no-self-compare": "error",
		"eslint/no-sequences": "error",
		"eslint/no-shadow-restricted-names": "error",
		"eslint/no-sparse-arrays": "error",
		"eslint/no-template-curly-in-string": "error",
		"eslint/no-this-before-super": "error",
		"eslint/no-throw-literal": "error",
		"eslint/no-undef": "error",
		"eslint/no-unexpected-multiline": "error",
		"eslint/no-unmodified-loop-condition": "error",
		"eslint/no-unneeded-ternary": ["error", { defaultAssignment: false }],
		"eslint/no-unreachable": "error",
		"eslint/no-unsafe-finally": "error",
		"eslint/no-unsafe-negation": "error",
		"eslint/no-unused-expressions": [
			"error",
			{
				allowShortCircuit: true,
				allowTaggedTemplates: true,
				allowTernary: true,
			},
		],
		"eslint/no-unused-vars": "off",
		"eslint/no-use-before-define": [
			"error",
			{ classes: false, functions: false, variables: true },
		],
		"eslint/no-useless-backreference": "error",
		"eslint/no-useless-call": "error",
		"eslint/no-useless-catch": "error",
		"eslint/no-useless-computed-key": "error",
		"eslint/no-useless-constructor": "error",
		"eslint/no-useless-rename": "error",
		"eslint/no-useless-return": "error",
		"eslint/no-var": "error",
		"eslint/no-with": "error",
		"eslint/prefer-const": [
			isInEditor ? "warn" : "error",
			{
				destructuring: "all",
				ignoreReadBeforeAssign: true,
			},
		],
		"eslint/prefer-exponentiation-operator": "error",
		"eslint/prefer-promise-reject-errors": "error",
		// regex-literals not supported in roblox-ts
		"eslint/prefer-regex-literals": roblox
			? "off"
			: ["error", { disallowRedundantWrapping: true }],
		"eslint/prefer-rest-params": "error",
		"eslint/prefer-spread": "error",
		"eslint/prefer-template": "error",
		"eslint/symbol-description": "error",
		"eslint/unicode-bom": ["error", "never"],
		"eslint/use-isnan": ["error", { enforceForIndexOf: true, enforceForSwitchCase: true }],
		"eslint/valid-typeof": ["error", { requireStringLiterals: true }],
		"eslint/vars-on-top": "error",
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

		...(stylistic !== false
			? {
					"eslint/max-lines": [
						"warn",
						{ max: 300, skipBlankLines: true, skipComments: true },
					],
					"eslint/max-lines-per-function": [
						"warn",
						{ max: 30, skipBlankLines: true, skipComments: true },
					],
					"eslint/no-lone-blocks": "error",
					"eslint/no-multi-str": "error",
					"eslint/yoda": ["error", "never"],

					...(!roblox
						? {
								"eslint/func-style": ["error", "declaration"],
							}
						: {}),
				}
			: {}),
	};

	return [
		{
			name: "isentinel/javascript",
			files: [GLOB_SRC],
			globals: {
				...toGlobals(globals.browser),
				...toGlobals(globals.es2021),
				...toGlobals(globals.node),
				document: "readonly",
				navigator: "readonly",
				window: "readonly",
			},
			jsPlugins: [
				{ name: "antfu", specifier: "eslint-plugin-antfu" },
				{ name: "de-morgan", specifier: "eslint-plugin-de-morgan" },
				{ name: "better-max-params", specifier: "eslint-plugin-better-max-params" },
				{ name: "unused-imports", specifier: "eslint-plugin-unused-imports" },
			],
			plugins: ["eslint"],
			rules,
		},
	];
}

function toGlobals(
	source: Record<string, boolean>,
	override?: "readonly" | "writable",
): Record<string, "readonly" | "writable"> {
	const result: Record<string, "readonly" | "writable"> = {};
	for (const [key, value] of Object.entries(source)) {
		result[key] = override ?? (value ? "writable" : "readonly");
	}

	return result;
}
