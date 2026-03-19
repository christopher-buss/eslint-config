import { GLOB_TS, GLOB_TSX } from "../../globs.ts";
import type {
	JsPluginRules,
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsStylistic,
	OptionsTypeScriptErasableOnly,
	OxlintRules,
	TypedOxlintConfigItem,
} from "../types.ts";

export function oxlintTypescript(
	options: OptionsComponentExtensions &
		OptionsFiles &
		OptionsStylistic &
		OptionsTypeScriptErasableOnly = {},
): Array<TypedOxlintConfigItem> {
	const { componentExts: componentExtensions = [], erasableOnly = false, stylistic } = options;

	const files = options.files?.flat() ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	// --- Native oxlint rules (eslint/* and typescript/* plugins) ---
	const nativeRules = {
		// eslint/* extension rules (oxlint handles TS-awareness natively)
		"eslint/default-param-last": "error",
		"eslint/no-array-constructor": "off",
		"eslint/no-dupe-class-members": "off",
		"eslint/no-empty-function": "off",
		"eslint/no-loss-of-precision": "off",
		"eslint/no-redeclare": "off",
		"eslint/no-shadow": "error",
		"eslint/no-throw-literal": "off",
		"eslint/no-unsafe-optional-chaining": "error",
		"eslint/no-unused-expressions": "error",
		"eslint/no-unused-private-class-members": "off",
		"eslint/no-unused-vars": "off",
		"eslint/no-use-before-define": "off",
		"eslint/no-useless-constructor": "error",
		"eslint/prefer-destructuring": ["error", { array: false, object: true }],
		"eslint/prefer-promise-reject-errors": "off",

		// typescript/* native rules
		"typescript/adjacent-overload-signatures": "off",
		"typescript/await-thenable": "error",
		"typescript/ban-ts-comment": ["error", { "ts-ignore": "allow-with-description" }],
		"typescript/consistent-type-assertions": [
			"error",
			{ assertionStyle: "as", objectLiteralTypeAssertions: "allow" },
		],
		"typescript/dot-notation": ["error", { allowKeywords: true }],
		"typescript/explicit-function-return-type": [
			"error",
			{
				allowExpressions: true,
			},
		],
		"typescript/no-confusing-non-null-assertion": "error",
		"typescript/no-confusing-void-expression": "error",
		"typescript/no-duplicate-type-constituents": "error",
		"typescript/no-dynamic-delete": "off",
		"typescript/no-empty-object-type": ["error", { allowInterfaces: "always" }],
		"typescript/no-explicit-any": "off",
		"typescript/no-extraneous-class": "error",
		"typescript/no-floating-promises": [
			"error",
			{
				ignoreVoid: true,
			},
		],
		"typescript/no-for-in-array": "error",
		"typescript/no-implied-eval": "error",
		"typescript/no-import-type-side-effects": "error",
		"typescript/no-inferrable-types": "error",
		"typescript/no-invalid-void-type": "off",
		"typescript/no-meaningless-void-operator": "error",
		"typescript/no-misused-promises": "error",
		"typescript/no-mixed-enums": "error",
		"typescript/no-namespace": "off",
		"typescript/no-non-null-assertion": "error",
		"typescript/no-redundant-type-constituents": "error",
		"typescript/no-require-imports": "error",
		"typescript/no-unnecessary-boolean-literal-compare": "error",
		"typescript/no-unnecessary-condition": ["error", { allowConstantLoopConditions: true }],
		"typescript/no-unnecessary-parameter-property-assignment": "error",
		"typescript/no-unnecessary-qualifier": "error",
		"typescript/no-unnecessary-template-expression": "error",
		"typescript/no-unnecessary-type-arguments": "error",
		"typescript/no-unnecessary-type-assertion": "error",
		"typescript/no-unnecessary-type-constraint": "error",
		"typescript/no-unnecessary-type-parameters": "error",
		"typescript/no-unsafe-argument": "error",
		"typescript/no-unsafe-assignment": "error",
		"typescript/no-unsafe-call": "error",
		"typescript/no-unsafe-enum-comparison": "error",
		"typescript/no-unsafe-member-access": "error",
		"typescript/no-unsafe-return": "error",
		"typescript/no-unsafe-unary-minus": "error",
		"typescript/no-useless-default-assignment": "error",
		"typescript/no-wrapper-object-types": "error",
		"typescript/non-nullable-type-assertion-style": "error",
		"typescript/only-throw-error": [
			"error",
			{ allow: [{ name: "Error", from: "package", package: "@rbxts/luau-polyfill" }] },
		],
		"typescript/prefer-find": "error",
		"typescript/prefer-for-of": "error",
		"typescript/prefer-function-type": "error",
		"typescript/prefer-includes": "error",
		"typescript/prefer-literal-enum-member": ["error", { allowBitwiseExpressions: true }],
		"typescript/prefer-nullish-coalescing": "error",
		"typescript/prefer-optional-chain": "error",
		"typescript/prefer-promise-reject-errors": "error",
		"typescript/prefer-readonly": "error",
		"typescript/prefer-reduce-type-parameter": "error",
		"typescript/prefer-return-this-type": "error",
		"typescript/promise-function-async": "error",
		"typescript/restrict-plus-operands": "error",
		"typescript/restrict-template-expressions": "off",
		"typescript/return-await": "error",
		"typescript/strict-boolean-expressions": "error",
		"typescript/strict-void-return": "error",
		"typescript/switch-exhaustiveness-check": "error",
		"typescript/triple-slash-reference": "off",
		"typescript/unbound-method": "error",
		"typescript/unified-signatures": "off",
		"typescript/use-unknown-in-catch-callback-variable": "error",

		// Stylistic (conditional)
		...(stylistic !== false
			? {
					"typescript/array-type": [
						"error",
						{
							default: "generic",
							readonly: "generic",
						},
					],
					"typescript/consistent-generic-constructors": ["error", "constructor"],
					"typescript/consistent-indexed-object-style": ["error", "record"],
					"typescript/consistent-type-definitions": ["error", "interface"],
					"typescript/consistent-type-imports": [
						"error",
						{ disallowTypeAnnotations: false, prefer: "type-imports" },
					],
				}
			: {}),
	} satisfies OxlintRules;

	// --- TS extension rules via @typescript-eslint jsPlugin ---
	// Rules not yet native to oxlint.
	const tsPluginRules = {
		"ts/explicit-member-accessibility": [
			"error",
			{
				overrides: {
					constructors: "no-public",
				},
			},
		],
		"ts/method-signature-style": "off",
		"ts/no-empty-function": "error",
		"ts/no-unused-private-class-members": "error",
	} satisfies JsPluginRules;

	return [
		{
			name: "isentinel/oxlint/typescript",
			files,
			plugins: ["eslint", "typescript"],
			rules: nativeRules,
		},
		{
			name: "isentinel/oxlint/typescript/ts-plugin",
			files,
			jsPlugins: [
				{
					name: "ts",
					specifier: "@typescript-eslint/eslint-plugin",
				},
			],
			rules: tsPluginRules,
		},
		{
			name: "isentinel/oxlint/typescript/eslint-js",
			files,
			jsPlugins: [
				{
					name: "eslint-js",
					specifier: "oxlint-plugin-eslint",
				},
			],
			rules: {
				"eslint-js/no-restricted-syntax": ["error", "[declare=true]"],
			},
		},
		...(erasableOnly
			? [
					{
						name: "isentinel/oxlint/typescript/erasable-syntax-only",
						files,
						jsPlugins: [
							{
								name: "erasable-syntax-only",
								specifier: "eslint-plugin-erasable-syntax-only",
							},
						],
						rules: {
							"erasable-syntax-only/enums": "error",
							"erasable-syntax-only/import-aliases": "error",
							"erasable-syntax-only/namespaces": "error",
							"erasable-syntax-only/parameter-properties": "error",
						},
					} as TypedOxlintConfigItem,
				]
			: []),
	];
}
