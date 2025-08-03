import { GLOB_TESTS } from "../globs";
import type {
	OptionsFiles,
	OptionsIsInEditor,
	OptionsOverrides,
	TypedFlatConfigItem,
} from "../types";
import { ensurePackages, interopDefault } from "../utils";

// Hold the reference so we don't redeclare the plugin on each call
let pluginTest: any;

export async function test(
	options: OptionsFiles & OptionsIsInEditor & OptionsOverrides = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { files = GLOB_TESTS, isInEditor = false, overrides = {} } = options;

	await ensurePackages(["eslint-plugin-jest"]);

	const pluginJest = await interopDefault(import("eslint-plugin-jest"));

	pluginTest ||= {
		...pluginJest,
	};

	return [
		{
			name: "isentinel/test/setup",
			plugins: {
				test: pluginTest,
			},
		},
		{
			files,
			name: "isentinel/test/rules",
			rules: {
				// Jest
				"test/consistent-test-it": "error",
				"test/expect-expect": "warn",
				"test/max-expects": "warn",
				"test/max-nested-describe": "error",
				"test/no-alias-methods": "error",
				"test/no-commented-out-tests": "warn",
				"test/no-conditional-expect": "error",
				"test/no-conditional-in-test": "error",
				"test/no-disabled-tests": "warn",
				"test/no-done-callback": "error",
				"test/no-duplicate-hooks": "error",
				"test/no-export": "error",
				"test/no-focused-tests": isInEditor ? "off" : "error",
				"test/no-identical-title": "error",
				"test/no-standalone-expect": "error",
				"test/no-test-prefixes": "error",
				"test/no-test-return-statement": "error",
				"test/no-untyped-mock-factory": "error",
				"test/padding-around-all": "warn",
				"test/prefer-called-with": "warn",
				"test/prefer-comparison-matcher": "warn",
				"test/prefer-each": "warn",
				"test/prefer-ending-with-an-expect": "warn",
				"test/prefer-equality-matcher": "warn",
				"test/prefer-hooks-in-order": "warn",
				"test/prefer-lowercase-title": "warn",
				"test/prefer-mock-promise-shorthand": "error",
				"test/prefer-strict-equal": "error",
				"test/prefer-to-be": "error",
				"test/prefer-to-contain": "error",
				"test/prefer-to-have-length": "error",
				"test/prefer-todo": "warn",
				"test/require-hook": "error",
				"test/require-to-throw-message": "warn",
				"test/require-top-level-describe": "error",
				"test/unbound-method": "error",
				"test/valid-describe-callback": "error",
				"test/valid-expect": "error",
				"test/valid-expect-in-promise": "error",
				"test/valid-title": "error",

				...overrides,
			},
			settings: {
				jest: {
					globalPackage: "@rbxts/jest-globals",
					version: 27,
				},
			},
		},
	];
}
