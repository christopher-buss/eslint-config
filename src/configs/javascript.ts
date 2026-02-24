import globals from "globals";

import { GLOB_SRC } from "../globs.ts";
import type {
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsStylistic,
	Rules,
	TypedFlatConfigItem,
	TypedOxlintConfigItem,
} from "../types.ts";
import { interopDefault } from "../utils.ts";

export function javascriptRules(options: {
	isInEditor: boolean;
	roblox: boolean;
	stylistic: boolean | object;
}): Rules {
	const { isInEditor, roblox, stylistic } = options;

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
				// eslint-disable-next-line unicorn/no-keyword-prefix -- External
				newIsCap: true,
				// eslint-disable-next-line unicorn/no-keyword-prefix -- External
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
							exceptions: ["_", "x", "y", "z", "a", "b", "e", "T"],
							max: 30,
							min: 2,
							properties: "never",
						},
					],
					"max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
					"max-lines-per-function": [
						"warn",
						{ max: 30, skipBlankLines: true, skipComments: true },
					],
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

export function oxlintJavascript(options: {
	isInEditor: boolean;
	roblox: boolean;
	stylistic: boolean | object;
}): Array<TypedOxlintConfigItem> {
	const allRules = javascriptRules(options);

	// Rules not supported in oxlint — won't implement (covered elsewhere)
	// dot-notation: use typescript/dot-notation (oxc-project/oxc#479)
	// no-dupe-args: superseded by strict mode (oxc-project/oxc#479)
	// no-octal: superseded by strict mode (oxc-project/oxc#479)
	// no-octal-escape: superseded by strict mode (oxc-project/oxc#479)
	// no-undef-init: covered by unicorn/no-useless-undefined
	// (oxc-project/oxc#6456) no-restricted-properties: not supported
	// (oxc-project/oxc#479) no-restricted-syntax: not supported
	// (oxc-project/oxc#479)
	const wontImplement = new Set([
		"dot-notation",
		"no-dupe-args",
		"no-octal",
		"no-octal-escape",
		"no-restricted-properties",
		"no-restricted-syntax",
		"no-undef-init",
	]);

	// TODO(oxlint): not yet implemented (oxc-project/oxc#479)
	// logical-assignment-operators, no-implied-eval, no-unreachable-loop,
	// object-shorthand, one-var, prefer-arrow-callback
	const notYetImplemented = new Set([
		"logical-assignment-operators",
		"no-implied-eval",
		"no-unreachable-loop",
		"object-shorthand",
		"one-var",
		"prefer-arrow-callback",
	]);

	// TODO: Need to enable this in eslint only for now
	const implementedButDifferent = new Set<string>([
		// Lints on generics (oxc-project/oxc#19617)
		"id-length",
	]);

	const omitRules = new Set([...wontImplement, ...notYetImplemented]);
	const prefixedRules: Rules = {};

	for (const [key, value] of Object.entries(allRules)) {
		if (omitRules.has(key) || implementedButDifferent.has(key)) {
			continue;
		}

		if (key.includes("/")) {
			// Already has a prefix (jsPlugin rule), keep as-is
			prefixedRules[key] = value;
		} else {
			// Unprefixed core ESLint rule -> add eslint/ prefix
			prefixedRules[`eslint/${key}`] = value;
		}
	}

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
			rules: prefixedRules,
		},
	];
}

export async function javascript(
	options: OptionsFiles &
		OptionsHasRoblox &
		OptionsIsInEditor &
		OptionsOverrides &
		OptionsStylistic = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { isInEditor = false, overrides = {}, roblox = true, stylistic = true } = options;

	const [pluginAntfu, pluginDeMorgan, pluginMaxParameters, pluginUnusedImports] =
		await Promise.all([
			interopDefault(import("eslint-plugin-antfu")),
			interopDefault(import("eslint-plugin-de-morgan")),
			// @ts-expect-error -- No types
			interopDefault(import("eslint-plugin-better-max-params")),
			interopDefault(import("eslint-plugin-unused-imports")),
		] as const);

	return [
		{
			name: "isentinel/javascript/setup",
			languageOptions: {
				ecmaVersion: "latest",
				globals: {
					...globals.browser,
					...globals.es2021,
					...globals.node,
					document: "readonly",
					navigator: "readonly",
					window: "readonly",
				},
				parserOptions: {
					ecmaFeatures: {
						jsx: true,
					},
					ecmaVersion: "latest",
					sourceType: "module",
				},
				sourceType: "module",
			},
			linterOptions: {
				reportUnusedDisableDirectives: true,
			},
		},
		{
			name: "isentinel/javascript/rules",
			files: [GLOB_SRC],
			plugins: {
				"antfu": pluginAntfu,
				"better-max-params": pluginMaxParameters,
				"de-morgan": pluginDeMorgan,
				"unused-imports": pluginUnusedImports,
			},
			rules: {
				...javascriptRules({ isInEditor, roblox, stylistic }),
				...overrides,
			},
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
