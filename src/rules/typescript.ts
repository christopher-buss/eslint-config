import type { OptionsStylistic, TypedFlatConfigItem } from "../types.ts";

/**
 * TypeScript rules shared between the ESLint and oxlint factories.
 *
 * These do not require type information. Rule names use the canonical
 * (renamed) ESLint prefixes; the oxlint factory translates them via the
 * oxlint rule mapping.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function typescriptRules({
	stylistic = true,
}: OptionsStylistic = {}): TypedFlatConfigItem["rules"] {
	return {
		"no-dupe-class-members": "off",
		"no-empty-function": "off",
		"no-loss-of-precision": "off",
		"no-redeclare": "off",
		"no-restricted-syntax": ["error", "[declare=true]"],
		"no-shadow": "off",
		"no-throw-literal": "off",
		"no-unused-expressions": "off",
		"no-unused-private-class-members": "off",
		"no-use-before-define": "off",
		"no-useless-constructor": "off",
		"prefer-destructuring": "off",

		"ts/adjacent-overload-signatures": "off",
		"ts/ban-ts-comment": ["error", { "ts-ignore": "allow-with-description" }],
		"ts/default-param-last": "error",
		"ts/explicit-function-return-type": [
			"error",
			{
				allowExpressions: true,
			},
		],
		"ts/explicit-member-accessibility": [
			"error",
			{
				overrides: {
					constructors: "no-public",
				},
			},
		],
		"ts/method-signature-style": "off",
		"ts/no-array-constructor": "off",
		"ts/no-confusing-non-null-assertion": "error",
		"ts/no-dupe-class-members": "off",
		"ts/no-dynamic-delete": "off",
		"ts/no-empty-function": "error",
		"ts/no-empty-object-type": ["error", { allowInterfaces: "always" }],
		"ts/no-explicit-any": "off",
		"ts/no-extraneous-class": "error",
		"ts/no-for-in-array": "off",
		"ts/no-import-type-side-effects": "error",
		"ts/no-inferrable-types": "error",
		"ts/no-invalid-void-type": "off",
		"ts/no-namespace": "off",
		"ts/no-non-null-assertion": "error",
		"ts/no-redeclare": "off",
		"ts/no-require-imports": "error",
		"ts/no-shadow": "error",
		"ts/no-unused-expressions": "error",
		"ts/no-unused-private-class-members": "error",
		"ts/no-unused-vars": "off",
		"ts/no-use-before-define": "off",
		"ts/no-useless-constructor": "error",
		"ts/no-wrapper-object-types": "error",
		"ts/prefer-for-of": "error",
		"ts/prefer-function-type": "error",
		"ts/prefer-literal-enum-member": ["error", { allowBitwiseExpressions: true }],
		"ts/triple-slash-reference": "off",

		"ts/unified-signatures": "off",

		...(stylistic !== false
			? {
					"ts/array-type": [
						"error",
						{
							default: "generic",
							readonly: "generic",
						},
					],
					"ts/consistent-generic-constructors": ["error", "constructor"],
					"ts/consistent-indexed-object-style": ["error", "record"],
					"ts/consistent-type-definitions": ["error", "interface"],
					"ts/consistent-type-imports": [
						"error",
						{ disallowTypeAnnotations: false, prefer: "type-imports" },
					],
				}
			: {}),
	};
}

/**
 * Type-aware TypeScript rules shared between the ESLint and oxlint factories.
 *
 * In hybrid mode these are executed by oxlint-tsgolint (`oxlint
 * --type-aware`).
 *
 * @returns The rule map.
 */
export function typescriptTypeAwareRules(): TypedFlatConfigItem["rules"] {
	return {
		"dot-notation": "off",
		"no-implied-eval": "off",
		"no-unsafe-optional-chaining": "error",
		"prefer-promise-reject-errors": "off",
		"ts/await-thenable": "error",
		"ts/consistent-type-assertions": [
			"error",
			{ assertionStyle: "as", objectLiteralTypeAssertions: "allow" },
		],
		"ts/dot-notation": ["error", { allowKeywords: true }],
		"ts/no-confusing-void-expression": "error",
		"ts/no-deprecated": "error",
		"ts/no-duplicate-type-constituents": "error",
		"ts/no-empty-object-type": "error",
		"ts/no-floating-promises": [
			"error",
			{
				ignoreVoid: true,
			},
		],
		"ts/no-for-in-array": "error",
		"ts/no-implied-eval": "error",
		"ts/no-meaningless-void-operator": "error",
		"ts/no-misused-promises": "error",
		"ts/no-mixed-enums": "error",
		"ts/no-redundant-type-constituents": "error",
		"ts/no-unnecessary-boolean-literal-compare": "error",
		"ts/no-unnecessary-condition": ["error", { allowConstantLoopConditions: true }],
		"ts/no-unnecessary-parameter-property-assignment": "error",
		"ts/no-unnecessary-qualifier": "error",
		"ts/no-unnecessary-template-expression": "error",
		"ts/no-unnecessary-type-arguments": "error",
		"ts/no-unnecessary-type-assertion": "error",
		"ts/no-unnecessary-type-constraint": "error",
		"ts/no-unnecessary-type-parameters": "error",
		"ts/no-unsafe-argument": "error",
		"ts/no-unsafe-assignment": "error",
		"ts/no-unsafe-call": "error",
		"ts/no-unsafe-enum-comparison": "error",
		"ts/no-unsafe-member-access": "error",
		"ts/no-unsafe-return": "error",
		"ts/no-unsafe-unary-minus": "error",
		"ts/no-useless-default-assignment": "error",
		"ts/non-nullable-type-assertion-style": "error",
		"ts/only-throw-error": [
			"error",
			{ allow: [{ name: "Error", from: "package", package: "@rbxts/luau-polyfill" }] },
		],
		"ts/prefer-destructuring": ["error", { array: false, object: true }],
		"ts/prefer-find": "error",
		"ts/prefer-includes": "error",
		"ts/prefer-nullish-coalescing": "error",
		"ts/prefer-optional-chain": "error",
		"ts/prefer-promise-reject-errors": "error",
		"ts/prefer-readonly": "error",
		"ts/prefer-reduce-type-parameter": "error",
		"ts/prefer-return-this-type": "error",
		"ts/promise-function-async": "error",
		"ts/restrict-plus-operands": "error",
		"ts/restrict-template-expressions": "off",
		"ts/return-await": "error",
		"ts/strict-boolean-expressions": "error",
		"ts/strict-void-return": "error",
		"ts/switch-exhaustiveness-check": "error",
		"ts/unbound-method": "error",
		"ts/use-unknown-in-catch-callback-variable": "error",
	};
}

/**
 * Static port of the `@typescript-eslint` `eslint-recommended` overrides:
 * core rules that are redundant (or wrong) on TypeScript files because the
 * compiler already checks them — most importantly `no-undef`, which would
 * otherwise flag every ambient global (Roblox/Lua globals, roblox-ts macros).
 *
 * The ESLint factory spreads the preset dynamically from the plugin; the
 * oxlint factory applies this static copy to its TypeScript files.
 *
 * @returns The rule map.
 */
export function typescriptRecommendedOverrides(): TypedFlatConfigItem["rules"] {
	return {
		"constructor-super": "off",
		"getter-return": "off",
		// Base-rule disables from the `strict` preset (the ts/ extension
		// variants replace them)
		"no-array-constructor": "off",
		"no-class-assign": "off",
		"no-const-assign": "off",
		"no-dupe-args": "off",
		"no-dupe-class-members": "off",
		"no-dupe-keys": "off",
		"no-func-assign": "off",
		"no-import-assign": "off",
		"no-new-native-nonconstructor": "off",
		"no-obj-calls": "off",
		"no-redeclare": "off",
		"no-setter-return": "off",
		"no-this-before-super": "off",
		"no-undef": "off",
		"no-unreachable": "off",
		"no-unsafe-negation": "off",
		"no-var": "error",
		"no-with": "off",
		"prefer-const": "error",
		"prefer-rest-params": "error",

		"prefer-spread": "error",
	};
}

/**
 * Rules enabled by the `@typescript-eslint` `strict` preset that are not
 * already configured explicitly in {@link typescriptRules}.
 *
 * The ESLint factory spreads the preset dynamically from the plugin; the
 * oxlint factory enables these explicitly so hybrid mode keeps full coverage.
 *
 * @returns The rule map.
 */
export function typescriptStrictPresetRules(): TypedFlatConfigItem["rules"] {
	return {
		"ts/no-duplicate-enum-values": "error",
		"ts/no-extra-non-null-assertion": "error",
		"ts/no-misused-new": "error",
		"ts/no-non-null-asserted-nullish-coalescing": "error",
		"ts/no-non-null-asserted-optional-chain": "error",
		"ts/no-this-alias": "error",
		"ts/no-unsafe-declaration-merging": "error",
		"ts/no-unsafe-function-type": "error",
		"ts/prefer-as-const": "error",
		"ts/prefer-namespace-keyword": "error",
	};
}

/**
 * Erasable-syntax-only rules shared between the ESLint and oxlint factories.
 *
 * @returns The rule map.
 */
export function erasableSyntaxOnlyRules(): TypedFlatConfigItem["rules"] {
	return {
		"erasable-syntax-only/enums": "error",
		"erasable-syntax-only/import-aliases": "error",
		"erasable-syntax-only/namespaces": "error",
		"erasable-syntax-only/parameter-properties": "error",
	};
}
