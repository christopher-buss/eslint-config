import globals from "globals";

import { GLOB_SRC } from "../../globs.ts";
import type {
	JsPluginRules,
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsStylistic,
	OxlintRules,
	TypedOxlintConfigItem,
} from "../types.ts";

export function oxlintJavascript(
	options: OptionsFiles &
		OptionsHasRoblox &
		OptionsIsInEditor &
		OptionsOverrides &
		OptionsStylistic,
): Array<TypedOxlintConfigItem> {
	const {
		files: customFiles,
		isInEditor = false,
		overrides = {},
		roblox = true,
		stylistic = true,
	} = options;

	const files = customFiles?.flat() ?? [GLOB_SRC];

	const nativeRules = {
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
				// oxlint-disable-next-line unicorn-js/no-keyword-prefix -- External API
				newIsCap: true,
				// oxlint-disable-next-line unicorn-js/no-keyword-prefix -- External API
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
		"eslint/prefer-rest-params": "error",
		"eslint/prefer-spread": "error",
		"eslint/prefer-template": "error",
		"eslint/symbol-description": "error",
		"eslint/unicode-bom": ["error", "never"],
		"eslint/use-isnan": ["error", { enforceForIndexOf: true, enforceForSwitchCase: true }],
		"eslint/valid-typeof": ["error", { requireStringLiterals: true }],
		"eslint/vars-on-top": "error",

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
	} satisfies OxlintRules;

	// Rules not yet native to oxlint.
	const jsPluginRules = {
		"antfu/no-top-level-await": "error",
		"better-max-params/better-max-params": [
			"error",
			{
				func: 4,
			},
		],
		"de-morgan/no-negated-conjunction": "error",
		"de-morgan/no-negated-disjunction": "error",
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
	} satisfies JsPluginRules;

	return [
		{
			name: "isentinel/javascript",
			files,
			globals: {
				...toGlobals(globals.browser),
				...toGlobals(globals.es2021),
				...toGlobals(globals.node),
				document: "readonly",
				navigator: "readonly",
				window: "readonly",
			},
			plugins: ["eslint"],
			rules: {
				...nativeRules,
				...overrides,
			},
		},
		{
			name: "isentinel/javascript/js-plugin",
			files,
			jsPlugins: [
				{ name: "antfu", specifier: "eslint-plugin-antfu" },
				{ name: "de-morgan", specifier: "eslint-plugin-de-morgan" },
				{ name: "better-max-params", specifier: "eslint-plugin-better-max-params" },
				{ name: "unused-imports", specifier: "eslint-plugin-unused-imports" },
			],
			rules: jsPluginRules,
		},
		{
			name: "isentinel/javascript/eslint-js",
			files,
			jsPlugins: [{ name: "eslint-js", specifier: "oxlint-plugin-eslint" }],
			rules: {
				"eslint-js/logical-assignment-operators": "error",
				"eslint-js/no-implied-eval": "error",
				"eslint-js/no-restricted-properties": [
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
				"eslint-js/no-restricted-syntax": [
					"error",
					"TSEnumDeclaration[const=true]",
					"TSExportAssignment",
				],
				"eslint-js/no-unreachable-loop": "error",
				"eslint-js/prefer-arrow-callback": [
					"error",
					{
						allowNamedFunctions: false,
						allowUnboundThis: true,
					},
				],
				// regex-literals not supported in roblox-ts
				"eslint-js/prefer-regex-literals": roblox
					? "off"
					: ["error", { disallowRedundantWrapping: true }],

				...(stylistic !== false
					? {
							// id-length via jsPlugin due to oxc-project/oxc#19617
							"eslint-js/id-length": [
								"error",
								{
									exceptions: ["_", "x", "y", "z", "a", "b", "e", "T"],
									max: 30,
									min: 2,
									properties: "never",
								},
							],
							"eslint-js/object-shorthand": [
								"error",
								"always",
								{
									avoidQuotes: true,
									ignoreConstructors: false,
								},
							],
							"eslint-js/one-var": ["error", { initialized: "never" }],
						}
					: {}),
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
