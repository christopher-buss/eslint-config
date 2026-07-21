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
		"jest/consistent-test-it": "error",
		"jest/expect-expect": "warn",
		"jest/max-expects": "error",
		"jest/max-nested-describe": ["error", { max: 4 }],
		"jest/no-alias-methods": "error",
		"jest/no-commented-out-tests": "warn",
		"jest/no-conditional-expect": "error",
		"jest/no-conditional-in-test": [
			"error",
			{
				allowOptionalChaining: false,
			},
		],
		"jest/no-disabled-tests": isInEditor ? "off" : "error",
		"jest/no-done-callback": "error",
		"jest/no-duplicate-hooks": "error",
		"jest/no-error-equal": isRoblox ? "off" : "error",
		"jest/no-export": "error",
		"jest/no-focused-tests": isInEditor ? "off" : "error",
		"jest/no-hooks": "error",
		"jest/no-identical-title": "error",
		"jest/no-standalone-expect": "error",
		"jest/no-test-prefixes": "error",
		"jest/no-test-return-statement": "error",
		"jest/no-unnecessary-assertion": "error",
		"jest/no-unneeded-async-expect-function": "error",
		"jest/no-untyped-mock-factory": "error",
		"jest/prefer-called-with": "warn",
		"jest/prefer-comparison-matcher": "warn",
		"jest/prefer-each": "warn",
		"jest/prefer-ending-with-an-expect": "warn",
		"jest/prefer-equality-matcher": "warn",
		"jest/prefer-expect-assertions": "error",
		"jest/prefer-hooks-in-order": "warn",
		"jest/prefer-lowercase-title": "warn",
		"jest/prefer-mock-promise-shorthand": "error",
		"jest/prefer-mock-return-shorthand": "error",
		"jest/prefer-spy-on": "warn",
		"jest/prefer-strict-equal": "error",
		"jest/prefer-to-be": "error",
		"jest/prefer-to-contain": "error",
		"jest/prefer-to-have-been-called": "error",
		"jest/prefer-to-have-been-called-times": "error",
		"jest/prefer-to-have-length": "error",
		"jest/prefer-todo": "warn",
		"jest/require-hook": "error",
		"jest/require-to-throw-message": "warn",
		"jest/require-top-level-describe": "error",
		"jest/unbound-method": "error",
		"jest/valid-describe-callback": "error",
		// Doesn't allow roblox deviations
		"jest/valid-expect": isRoblox ? "off" : "error",
		"jest/valid-expect-in-promise": "error",
		"jest/valid-expect-with-promise": "error",
		"jest/valid-title": [
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
					"flawless/padding-after-expect-assertions": "warn",
					"jest/padding-around-all": "warn",
				}
			: {}),
	};
}

/**
 * Vitest rules shared between the ESLint and oxlint factories.
 *
 * The ESLint factory runs `@vitest/eslint-plugin` (an optional peer). The
 * oxlint factory runs the family as native rules, except `padding-around-all`
 * and `prefer-vi-mocked` (no native port) which run via the plugin as a
 * jsPlugin.
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
					"flawless/padding-after-expect-assertions": "warn",
					"vitest/padding-around-all": "warn",
				}
			: {}),
	};
}
