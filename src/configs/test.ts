import type PluginVitest from "@vitest/eslint-plugin";

import type PluginJest from "eslint-plugin-jest";

import { GLOB_TESTS } from "../globs";
import type {
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsProjectType,
	OptionsStylistic,
	OptionsTestFramework,
	OptionsVitest,
	TypedFlatConfigItem,
} from "../types";
import { ensurePackages, interopDefault } from "../utils";

// Hold the references so we don't redeclare the plugins on each call
let pluginTest: typeof PluginJest | undefined;
let pluginVitest: typeof PluginVitest | undefined;

export async function test(
	options: OptionsFiles &
		OptionsHasRoblox &
		OptionsIsInEditor &
		OptionsOverrides &
		OptionsProjectType &
		OptionsStylistic &
		OptionsTestFramework = {},
): Promise<Array<TypedFlatConfigItem>> {
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
	const enableJest = jest || (!vitestEnabled && (type === "game" || isRoblox));
	const enableVitest = vitestEnabled || (!jest && type === "package" && !isRoblox);

	const configs: Array<TypedFlatConfigItem> = [];

	if (enableJest) {
		await ensurePackages(["eslint-plugin-jest"]);
		const pluginJest = await interopDefault(import("eslint-plugin-jest"));
		pluginTest ??= {
			...pluginJest,
		};

		configs.push(
			{
				name: "isentinel/test/jest/setup",
				plugins: {
					test: pluginTest,
				},
			},
			{
				name: "isentinel/test/jest/rules",
				files,
				rules: {
					"test/consistent-test-it": "error",
					"test/expect-expect": "warn",
					"test/max-expects": "error",
					"test/max-nested-describe": ["error", { max: 4 }],
					"test/no-alias-methods": "error",
					"test/no-commented-out-tests": "warn",
					"test/no-conditional-expect": "error",
					"test/no-conditional-in-test": "error",
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

					...(stylistic !== false
						? {
								"test/padding-around-all": "warn",
							}
						: {}),

					...overrides,
				},
				settings: {
					jest: {
						globalPackage: "@rbxts/jest-globals",
						version: 27,
					},
				},
			},
		);
	}

	if (enableVitest) {
		await ensurePackages(["@vitest/eslint-plugin"]);
		const vitestPlugin = await interopDefault(import("@vitest/eslint-plugin"));
		pluginVitest ??= {
			...vitestPlugin,
		};

		configs.push(
			{
				name: "isentinel/test/vitest/setup",
				plugins: {
					vitest: pluginVitest,
				},
			},
			{
				name: "isentinel/test/vitest/rules",
				files,
				rules: {
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
					"vitest/prefer-called-exactly-once-with": "warn",
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
					"vitest/prefer-snapshot-hint": "warn",
					"vitest/prefer-spy-on": "warn",
					"vitest/prefer-strict-boolean-matchers": "error",
					"vitest/prefer-strict-equal": "error",
					"vitest/prefer-to-be": "error",
					"vitest/prefer-to-be-object": "error",
					"vitest/prefer-to-contain": "error",
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

					...(stylistic !== false
						? {
								"vitest/padding-around-all": "warn",
							}
						: {}),

					...overrides,
				},
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
