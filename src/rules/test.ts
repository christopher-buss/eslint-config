import type {
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";

export interface JestRuleOptions extends OptionsHasRoblox, OptionsIsInEditor, OptionsStylistic {
	extended?: boolean;
}

export interface VitestRuleOptions extends OptionsIsInEditor, OptionsStylistic {
	extended?: boolean;
}

/**
 * Jest-extended rules shared between the ESLint and oxlint factories.
 *
 * @returns The rule map.
 */
export function jestExtendedRules(): TypedFlatConfigItem["rules"] {
	return {
		"jest-extended/prefer-to-be-array": "error",
		"jest-extended/prefer-to-be-false": "error",
		"jest-extended/prefer-to-be-object": "error",
		"jest-extended/prefer-to-be-true": "error",
		"jest-extended/prefer-to-have-been-called-once": "error",
	};
}

/**
 * Jest rules shared between the ESLint and oxlint factories.
 *
 * Both factories run `eslint-plugin-jest` as a jsPlugin: the native oxlint jest
 * plugin does not support `settings.jest.globalPackage` (oxc-project/oxc#23290)
 * and we use `@rbxts/jest-globals`. The four type-aware jest rules stay in
 * ESLint (jsPlugins have no type information).
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function jestRules({
	extended = false,
	isInEditor = false,
	roblox: isRoblox = true,
	stylistic = true,
}: JestRuleOptions = {}): TypedFlatConfigItem["rules"] {
	return {
		"test/consistent-test-it": "error",
		"test/expect-expect": "warn",
		"test/max-expects": "error",
		"test/max-nested-describe": ["error", { max: 4 }],
		"test/no-alias-methods": "error",
		"test/no-commented-out-tests": "warn",
		"test/no-conditional-expect": "error",
		"test/no-conditional-in-test": [
			"error",
			{
				allowOptionalChaining: false,
			},
		],
		"test/no-disabled-tests": isInEditor ? "off" : "error",
		"test/no-done-callback": "error",
		"test/no-duplicate-hooks": "error",
		"test/no-error-equal": isRoblox ? "off" : "error",
		"test/no-export": "error",
		"test/no-focused-tests": isInEditor ? "off" : "error",
		"test/no-hooks": "error",
		"test/no-identical-title": "error",
		"test/no-standalone-expect": "error",
		"test/no-test-prefixes": "error",
		"test/no-test-return-statement": "error",
		"test/no-unnecessary-assertion": "error",
		"test/no-unneeded-async-expect-function": "error",
		"test/no-untyped-mock-factory": "error",
		"test/prefer-called-with": "warn",
		"test/prefer-comparison-matcher": "warn",
		"test/prefer-each": "warn",
		"test/prefer-ending-with-an-expect": "warn",
		"test/prefer-equality-matcher": "warn",
		"test/prefer-expect-assertions": "error",
		"test/prefer-hooks-in-order": "warn",
		"test/prefer-lowercase-title": "warn",
		"test/prefer-mock-promise-shorthand": "error",
		"test/prefer-mock-return-shorthand": "error",
		"test/prefer-spy-on": "warn",
		"test/prefer-strict-equal": "error",
		"test/prefer-to-be": "error",
		"test/prefer-to-contain": "error",
		"test/prefer-to-have-been-called": "error",
		"test/prefer-to-have-been-called-times": "error",
		"test/prefer-to-have-length": "error",
		"test/prefer-todo": "warn",
		"test/require-hook": "error",
		"test/require-to-throw-message": "warn",
		"test/require-top-level-describe": "error",
		"test/unbound-method": "error",
		"test/valid-describe-callback": "error",
		// Doesn't allow roblox deviations
		"test/valid-expect": isRoblox ? "off" : "error",
		"test/valid-expect-in-promise": "error",
		"test/valid-expect-with-promise": "error",
		"test/valid-title": [
			"error",
			{
				ignoreTypeOfDescribeName: true,
				mustMatch: {
					it: ["^should", 'Test title must start with "should"'],
				},
			},
		],

		...(extended ? jestExtendedRules() : {}),

		...(stylistic !== false
			? {
					"test/padding-around-all": "warn",
				}
			: {}),
	};
}

/**
 * Vitest rules shared between the ESLint and oxlint factories.
 *
 * The ESLint factory runs `@vitest/eslint-plugin` (an optional peer). The oxlint
 * factory runs the family as native rules, except `padding-around-all` and
 * `prefer-vi-mocked` (no native port) which run via the plugin as a jsPlugin.
 *
 * @param options - Shared rule options.
 * @returns The rule map.
 */
export function vitestRules({
	extended = false,
	isInEditor = false,
	stylistic = true,
}: VitestRuleOptions = {}): TypedFlatConfigItem["rules"] {
	return {
		"vitest/consistent-each-for": [
			"error",
			{
				describe: "for",
				it: "for",
				suite: "for",
				test: "for",
			},
		],
		"vitest/consistent-test-filename": [
			"error",
			{
				pattern: ".*\\.spec\\.[tj]sx?$",
			},
		],
		"vitest/consistent-test-it": ["error", { fn: "it", withinDescribe: "it" }],
		"vitest/consistent-vitest-vi": "error",
		"vitest/expect-expect": "warn",
		"vitest/hoisted-apis-on-top": "error",
		"vitest/max-expects": "error",
		"vitest/max-nested-describe": ["error", { max: 4 }],
		"vitest/no-alias-methods": "error",
		"vitest/no-commented-out-tests": "warn",
		"vitest/no-conditional-expect": "error",
		"vitest/no-conditional-in-test": "error",
		"vitest/no-conditional-tests": "error",
		"vitest/no-disabled-tests": isInEditor ? "off" : "error",
		"vitest/no-duplicate-hooks": "error",
		"vitest/no-focused-tests": isInEditor ? "off" : "error",
		"vitest/no-hooks": "error",
		"vitest/no-identical-title": "error",
		"vitest/no-import-node-test": "error",
		"vitest/no-interpolation-in-snapshots": "error",
		"vitest/no-large-snapshots": "warn",
		"vitest/no-mocks-import": "error",
		"vitest/no-standalone-expect": "error",
		"vitest/no-test-prefixes": "error",
		"vitest/no-test-return-statement": "error",
		"vitest/no-unneeded-async-expect-function": "error",
		"vitest/prefer-called-exactly-once-with": "warn",
		"vitest/prefer-called-once": "error",
		"vitest/prefer-called-with": "error",
		"vitest/prefer-comparison-matcher": "warn",
		"vitest/prefer-describe-function-title": "warn",
		"vitest/prefer-each": "warn",
		"vitest/prefer-equality-matcher": "warn",
		"vitest/prefer-expect-assertions": "warn",
		"vitest/prefer-expect-resolves": "error",
		"vitest/prefer-expect-type-of": "error",
		"vitest/prefer-hooks-in-order": "error",
		"vitest/prefer-hooks-on-top": "error",
		"vitest/prefer-import-in-mock": "error",
		"vitest/prefer-importing-vitest-globals": "error",
		"vitest/prefer-lowercase-title": "error",
		"vitest/prefer-mock-promise-shorthand": "error",
		"vitest/prefer-mock-return-shorthand": "error",
		"vitest/prefer-snapshot-hint": "warn",
		"vitest/prefer-spy-on": "warn",
		"vitest/prefer-strict-boolean-matchers": "error",
		"vitest/prefer-strict-equal": "error",
		"vitest/prefer-to-be": "error",
		"vitest/prefer-to-be-object": "error",
		"vitest/prefer-to-contain": "error",
		"vitest/prefer-to-have-been-called-times": "error",
		"vitest/prefer-to-have-length": "error",
		"vitest/prefer-todo": "warn",
		"vitest/prefer-vi-mocked": "error",
		"vitest/require-awaited-expect-poll": "error",
		"vitest/require-local-test-context-for-concurrent-snapshots": "error",
		"vitest/require-mock-type-parameters": "error",
		"vitest/require-to-throw-message": "warn",
		"vitest/require-top-level-describe": "error",
		"vitest/valid-describe-callback": "error",
		"vitest/valid-expect": "error",
		"vitest/valid-expect-in-promise": "error",
		"vitest/valid-title": [
			"error",
			{
				ignoreTypeOfDescribeName: true,
				mustMatch: {
					it: ["^should", 'Test title must start with "should"'],
				},
			},
		],

		...(extended ? jestExtendedRules() : {}),

		...(stylistic !== false
			? {
					"vitest/padding-around-all": "warn",
				}
			: {}),
	};
}
