import { GLOB_TESTS } from "../../globs.ts";
import type {
	JsPluginRules,
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsJest,
	OptionsOverrides,
	OptionsProjectType,
	OptionsStylistic,
	OptionsTestFramework,
	OptionsVitest,
	OxlintRules,
	TypedOxlintConfigItem,
} from "../types.ts";

export function oxlintTest(
	options: OptionsFiles &
		OptionsHasRoblox &
		OptionsIsInEditor &
		OptionsOverrides &
		OptionsProjectType &
		OptionsStylistic &
		OptionsTestFramework = {},
): Array<TypedOxlintConfigItem> {
	const {
		files = GLOB_TESTS,
		isInEditor = false,
		jest = false,
		overrides = {},
		roblox: isRoblox = true,
		stylistic = true,
		type = "game",
		vitest = false,
	} = options;

	const vitestOptions: OptionsVitest = typeof vitest === "object" ? vitest : {};
	const vitestEnabled = vitest === true || typeof vitest === "object";
	const jestOptions: OptionsJest = typeof jest === "object" ? jest : {};
	const jestEnabled = jest === true || typeof jest === "object";
	const enableJest = jestEnabled || (!vitestEnabled && (type === "game" || isRoblox));
	const enableVitest = vitestEnabled || (!jestEnabled && type === "package" && !isRoblox);

	const flatFiles = files.flat();
	const configs: Array<TypedOxlintConfigItem> = [];

	if (enableJest) {
		const useJestExtended = jestOptions.extended === true;

		const nativeRules = {
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
			"jest/no-export": "error",
			"jest/no-focused-tests": isInEditor ? "off" : "error",
			"jest/no-hooks": "error",
			"jest/no-identical-title": "error",
			"jest/no-standalone-expect": "error",
			"jest/no-test-prefixes": "error",
			"jest/no-test-return-statement": "error",
			"jest/no-unneeded-async-expect-function": "error",
			"jest/no-untyped-mock-factory": "error",
			"jest/prefer-called-with": "warn",
			"jest/prefer-comparison-matcher": "warn",
			"jest/prefer-each": "warn",
			"jest/prefer-equality-matcher": "warn",
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
			"jest/valid-describe-callback": "error",
			"jest/valid-expect": isRoblox ? "off" : "error",
			"jest/valid-title": [
				"error",
				{
					ignoreTypeOfDescribeName: true,
					mustMatch: {
						it: ["^should", 'Test title must start with "should"'],
					},
				},
			],

			...(stylistic !== false
				? {
						"jest/padding-around-test-blocks": "warn",
					}
				: {}),
		} satisfies OxlintRules;

		const jsPluginRules = {
			"test/no-error-equal": isRoblox ? "off" : "error",
			"test/no-unnecessary-assertion": "error",
			"test/prefer-ending-with-an-expect": "warn",
			"test/prefer-expect-assertions": "error",
			"test/unbound-method": "error",
			"test/valid-expect-in-promise": "error",
			"test/valid-expect-with-promise": "error",

			...(useJestExtended
				? {
						"jest-extended/prefer-to-be-array": "error",
						"jest-extended/prefer-to-be-false": "error",
						"jest-extended/prefer-to-be-object": "error",
						"jest-extended/prefer-to-be-true": "error",
						"jest-extended/prefer-to-have-been-called-once": "error",
					}
				: {}),
		} satisfies JsPluginRules;

		configs.push(
			{
				name: "isentinel/oxlint/test/jest",
				files: flatFiles,
				plugins: ["jest"],
				rules: nativeRules,
				settings: {
					jest: {
						globalPackage: "@rbxts/jest-globals",
						version: 27,
					},
				},
			},
			{
				name: "isentinel/oxlint/test/jest/js-plugin",
				files: flatFiles,
				jsPlugins: [
					{ name: "test", specifier: "eslint-plugin-jest" },
					...(useJestExtended
						? [{ name: "jest-extended", specifier: "eslint-plugin-jest-extended" }]
						: []),
				],
				rules: { ...jsPluginRules, ...overrides },
			},
		);
	}

	if (enableVitest) {
		// TODO(oxlint): many vitest rules share implementations with jest and
		// are missing from `oxlint --rules` output (oxc-project/oxc#20466).
		// Until resolved, shared rules stay in jsPluginRules via vitest-js.
		const nativeRules = {
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
			"vitest/consistent-vitest-vi": "error",
			"vitest/hoisted-apis-on-top": "error",
			"vitest/no-conditional-tests": "error",
			"vitest/no-import-node-test": "error",
			"vitest/prefer-describe-function-title": "warn",
			"vitest/prefer-expect-type-of": "error",
			"vitest/prefer-import-in-mock": "error",
			"vitest/prefer-to-be-object": "error",
			"vitest/require-local-test-context-for-concurrent-snapshots": "error",
		} satisfies OxlintRules;

		const jsPluginRules = {
			"vitest-js/consistent-test-it": ["error", { fn: "it", withinDescribe: "it" }],
			"vitest-js/expect-expect": "warn",
			"vitest-js/max-expects": "error",
			"vitest-js/max-nested-describe": ["error", { max: 4 }],
			"vitest-js/no-alias-methods": "error",
			"vitest-js/no-commented-out-tests": "warn",
			"vitest-js/no-conditional-expect": "error",
			"vitest-js/no-conditional-in-test": "error",
			"vitest-js/no-disabled-tests": isInEditor ? "off" : "error",
			"vitest-js/no-duplicate-hooks": "error",
			"vitest-js/no-focused-tests": isInEditor ? "off" : "error",
			"vitest-js/no-hooks": "error",
			"vitest-js/no-identical-title": "error",
			"vitest-js/no-interpolation-in-snapshots": "error",
			"vitest-js/no-large-snapshots": "warn",
			"vitest-js/no-mocks-import": "error",
			"vitest-js/no-standalone-expect": "error",
			"vitest-js/no-test-prefixes": "error",
			"vitest-js/no-test-return-statement": "error",
			"vitest-js/prefer-called-exactly-once-with": "warn",
			"vitest-js/prefer-comparison-matcher": "warn",
			"vitest-js/prefer-each": "warn",
			"vitest-js/prefer-equality-matcher": "warn",
			"vitest-js/prefer-expect-assertions": "warn",
			"vitest-js/prefer-expect-resolves": "error",
			"vitest-js/prefer-hooks-in-order": "error",
			"vitest-js/prefer-hooks-on-top": "error",
			"vitest-js/prefer-importing-vitest-globals": "error",
			"vitest-js/prefer-lowercase-title": "error",
			"vitest-js/prefer-mock-promise-shorthand": "error",
			"vitest-js/prefer-mock-return-shorthand": "error",
			"vitest-js/prefer-snapshot-hint": "warn",
			"vitest-js/prefer-spy-on": "warn",
			"vitest-js/prefer-strict-boolean-matchers": "error",
			"vitest-js/prefer-strict-equal": "error",
			"vitest-js/prefer-to-be": "error",
			"vitest-js/prefer-to-contain": "error",
			"vitest-js/prefer-todo": "warn",
			"vitest-js/prefer-vi-mocked": "error",
			"vitest-js/require-awaited-expect-poll": "error",
			"vitest-js/require-mock-type-parameters": "error",
			"vitest-js/require-to-throw-message": "warn",
			"vitest-js/require-top-level-describe": "error",
			"vitest-js/valid-describe-callback": "error",
			"vitest-js/valid-expect": "error",
			"vitest-js/valid-expect-in-promise": "error",
			"vitest-js/valid-title": [
				"error",
				{
					ignoreTypeOfDescribeName: true,
					mustMatch: {
						it: ["^should", 'Test title must start with "should"'],
					},
				},
			],

			...(stylistic !== false
				? {
						"vitest-js/padding-around-all": "warn",
					}
				: {}),
		} satisfies JsPluginRules;

		configs.push(
			{
				name: "isentinel/oxlint/test/vitest",
				files: flatFiles,
				plugins: ["vitest"],
				rules: nativeRules,
			},
			{
				name: "isentinel/oxlint/test/vitest/js-plugin",
				files: flatFiles,
				jsPlugins: [{ name: "vitest-js", specifier: "@vitest/eslint-plugin" }],
				rules: { ...jsPluginRules, ...overrides },
				settings: {
					vitest: {
						typecheck: vitestOptions.typecheck ?? false,
					},
				},
			},
		);
	}

	return configs;
}
