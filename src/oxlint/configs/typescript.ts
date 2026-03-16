import { GLOB_TS, GLOB_TSX } from "../../globs.ts";
import type { Rules, TypedOxlintConfigItem } from "../../types.ts";

export function oxlintTypescript(options: {
	stylistic: boolean | object;
}): Array<TypedOxlintConfigItem> {
	const { stylistic } = options;

	// Inlined from typescriptRules() + typescriptTypeAwareRules(), with
	// prefixes transformed for oxlint:
	// - ts/* extension rules → eslint/*
	// - ts/* typescript rules → typescript/*
	// - Not-yet-implemented rules omitted

	// TODO(oxlint): not yet implemented (oxc-project/oxc#2180)
	// explicit-member-accessibility, method-signature-style

	const rules: Rules = {
		// --- typescriptRules (extension rules) → eslint/ ---
		"eslint/default-param-last": "error",
		"eslint/no-array-constructor": "off",
		"eslint/no-dupe-class-members": "off",
		"eslint/no-empty-function": "error",
		"eslint/no-redeclare": "off",
		"eslint/no-shadow": "error",
		"eslint/no-unused-expressions": "error",
		"eslint/no-unused-private-class-members": "error",
		"eslint/no-unused-vars": "off",
		"eslint/no-use-before-define": "off",
		"eslint/no-useless-constructor": "error",
		// --- typescriptTypeAwareRules (extension rules) → eslint/ ---
		"eslint/prefer-destructuring": ["error", { array: false, object: true }],
		// --- typescriptRules (non-extension) → typescript/ ---
		"typescript/adjacent-overload-signatures": "off",
		// --- typescriptTypeAwareRules → typescript/ ---
		"typescript/await-thenable": "error",
		"typescript/ban-ts-comment": ["error", { "ts-ignore": "allow-with-description" }],
		"typescript/consistent-type-assertions": [
			"error",
			{ assertionStyle: "as", objectLiteralTypeAssertions: "allow" },
		],
		"typescript/dot-notation": ["error", { allowKeywords: true }],
		"typescript/no-confusing-non-null-assertion": "error",
		"typescript/no-confusing-void-expression": "error",

		"typescript/no-duplicate-type-constituents": "error",
		"typescript/no-dynamic-delete": "off",
		// Overridden by type-aware variant
		"typescript/no-empty-object-type": "error",
		// no-empty-object-type: overridden by type-aware variant below
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
		// no-for-in-array: overridden by type-aware variant below
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
		"typescript/no-unused-vars": "off",
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

		// --- stylistic (conditional) → typescript/ ---
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
	};

	return [
		{
			name: "isentinel/typescript",
			files: [GLOB_TS, GLOB_TSX],
			plugins: ["eslint", "typescript"],
			rules,
		},
	];
}
