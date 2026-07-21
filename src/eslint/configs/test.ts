import type PluginVitest from "@vitest/eslint-plugin";

import type PluginJest from "eslint-plugin-jest";

import { GLOB_TESTS, GLOB_TYPE_TESTS } from "../../globs.ts";
import { sonarjsTestRules } from "../../rules/sonarjs.ts";
import { jestRules, typeTestRules, vitestRules } from "../../rules/test.ts";
import { ensurePackages, interopDefault } from "../../utils.ts";
import type {
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsJest,
	OptionsOverrides,
	OptionsProjectType,
	OptionsStylistic,
	OptionsTestFramework,
	OptionsVitest,
	TypedFlatConfigItem,
} from "../types.ts";

// Hold the references so we don't redeclare the plugins on each call
let pluginJest: typeof PluginJest | undefined;
let pluginJestExtended: any;
let pluginVitest: typeof PluginVitest | undefined;

export async function test({
	files = GLOB_TESTS,
	isInEditor = false,
	jest = false,
	overrides = {},
	roblox: isRoblox = true,
	stylistic = true,
	type = "game",
	vitest = false,
}: OptionsFiles &
	OptionsHasRoblox &
	OptionsIsInEditor &
	OptionsOverrides &
	OptionsProjectType &
	OptionsStylistic &
	OptionsTestFramework = {}): Promise<Array<TypedFlatConfigItem>> {
	const vitestOptions: OptionsVitest = typeof vitest === "object" ? vitest : {};
	const vitestEnabled = vitest === true || typeof vitest === "object";
	const jestOptions: OptionsJest = typeof jest === "object" ? jest : {};
	const jestEnabled = jest === true || typeof jest === "object";
	const enableJest = jestEnabled || (!vitestEnabled && (type === "game" || isRoblox));
	const enableVitest = vitestEnabled || (!jestEnabled && type === "package" && !isRoblox);

	const configs: Array<TypedFlatConfigItem> = [];

	if (enableJest) {
		await ensurePackages(["eslint-plugin-jest"]);
		const jestPlugin = await interopDefault(import("eslint-plugin-jest"));

		const useJestExtended = jestOptions.extended === true;

		const jestExtendedPlugin = await (async () => {
			if (!useJestExtended) {
				return;
			}

			await ensurePackages(["eslint-plugin-jest-extended"]);
			// @ts-expect-error -- No types
			// oxlint-disable-next-line typescript/no-unsafe-return -- No types
			return interopDefault(import("eslint-plugin-jest-extended"));
		})();

		pluginJest ??= {
			...jestPlugin,
		};

		pluginJestExtended ??= {
			...jestExtendedPlugin,
		};

		configs.push(
			{
				name: "isentinel/test/jest/setup",
				plugins: {
					jest: pluginJest,
					...(useJestExtended ? { "jest-extended": pluginJestExtended } : {}),
				},
			},
			{
				name: "isentinel/test/jest/rules",
				files: jestOptions.files ?? files,
				...(jestOptions.ignores ? { ignores: jestOptions.ignores } : {}),
				rules: {
					...jestRules({
						extended: useJestExtended,
						isInEditor,
						roblox: isRoblox,
						stylistic,
					}),
					...sonarjsTestRules({ jest: true }),

					...overrides,
					...jestOptions.overrides,
				},
				settings: {
					jest: {
						globalPackage: "@rbxts/jest-globals",
						version: 27,
					},
				},
			},
			{
				name: "isentinel/test/jest/type-tests",
				files: [GLOB_TYPE_TESTS],
				rules: typeTestRules("jest"),
			},
		);
	}

	if (enableVitest) {
		await ensurePackages(["@vitest/eslint-plugin"]);
		const vitestPlugin = await interopDefault(import("@vitest/eslint-plugin"));

		const useJestExtended = vitestOptions.extended === true;

		const jestExtendedPlugin = await (async () => {
			if (!useJestExtended) {
				return;
			}

			await ensurePackages(["eslint-plugin-jest-extended"]);
			// @ts-expect-error -- No types
			// oxlint-disable-next-line typescript/no-unsafe-return -- No types
			return interopDefault(import("eslint-plugin-jest-extended"));
		})();

		pluginVitest ??= {
			...vitestPlugin,
		};

		pluginJestExtended ??= {
			...jestExtendedPlugin,
		};

		configs.push(
			{
				name: "isentinel/test/vitest/setup",
				plugins: {
					vitest: pluginVitest,
					...(useJestExtended ? { "jest-extended": pluginJestExtended } : {}),
				},
			},
			{
				name: "isentinel/test/vitest/rules",
				files: vitestOptions.files ?? files,
				...(vitestOptions.ignores ? { ignores: vitestOptions.ignores } : {}),
				rules: {
					...vitestRules({
						extended: useJestExtended,
						isInEditor,
						stylistic,
					}),
					...sonarjsTestRules(),

					...overrides,
					...vitestOptions.overrides,
				},
				settings: {
					...(useJestExtended ? { jest: { globalPackage: "vitest" } } : {}),
					vitest: {
						typecheck: vitestOptions.typecheck ?? false,
					},
				},
			},
			{
				name: "isentinel/test/vitest/type-tests",
				files: [GLOB_TYPE_TESTS],
				rules: typeTestRules("vitest"),
			},
		);
	}

	return configs;
}
