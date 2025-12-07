import type PluginVitest from "@vitest/eslint-plugin";

import type PluginJest from "eslint-plugin-jest";

import { GLOB_TESTS } from "../globs";
import type {
	OptionsFiles,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsProjectType,
	OptionsRoblox,
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
		OptionsIsInEditor &
		OptionsOverrides &
		OptionsProjectType &
		OptionsRoblox &
		OptionsStylistic &
		OptionsTestFramework = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		files = GLOB_TESTS,
		isInEditor = false,
		jest = false,
		overrides = {},
		roblox = true,
		stylistic = true,
		type = "game",
		vitest = false,
	} = options;

	const vitestOptions: OptionsVitest = typeof vitest === "object" ? vitest : {};
	const enableJest = jest || (vitest !== false && (type === "game" || roblox));
	const enableVitest = vitest !== false || (!jest && type === "package" && !roblox);

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
				files,
				name: "isentinel/test/jest/rules",
				rules: {
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
				files,
				name: "isentinel/test/vitest/rules",
				rules: {
					"vitest/consistent-test-it": ["error", { fn: "it", withinDescribe: "it" }],
					"vitest/no-identical-title": "error",
					"vitest/no-import-node-test": "error",
					"vitest/prefer-hooks-in-order": "error",
					"vitest/prefer-lowercase-title": "error",

					...(stylistic !== false
						? {
								"vitest/consistent-test-filename": [
									"error",
									{
										pattern: ".*\\.spec\\.[tj]sx?$",
									},
								],
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
