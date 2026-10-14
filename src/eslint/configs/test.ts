import type PluginVitest from "@vitest/eslint-plugin";

import type PluginJest from "eslint-plugin-jest";

import { GLOB_TESTS, GLOB_TYPE_TESTS } from "../../globs.ts";
import { smallRulesTestRules } from "../../rules/small-rules.ts";
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
	complementIgnores,
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
	OptionsTestFramework & {
		/**
		 * When set, re-apply the non-roblox rules to every test file except
		 * these globs (the roblox scope), so the complement is linted as
		 * standard-TS/Node land. The framework choice stays the same.
		 */
		complementIgnores?: Array<string>;
	} = {}): Promise<Array<TypedFlatConfigItem>> {
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

		const jestFiles = jestOptions.files ?? files;
		const jestItemRules = (roblox: boolean): TypedFlatConfigItem["rules"] => {
			return {
				...jestRules({ extended: useJestExtended, isInEditor, roblox, stylistic }),
				...sonarjsTestRules({ jest: true, roblox }),
				...smallRulesTestRules(),

				...overrides,
				...jestOptions.overrides,
			};
		};

		const jestSettings = {
			jest: {
				globalPackage: "@rbxts/jest-globals",
				version: 27,
			},
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
				files: jestFiles,
				...(jestOptions.ignores ? { ignores: jestOptions.ignores } : {}),
				rules: jestItemRules(isRoblox),
				settings: jestSettings,
			},
			// The complement re-applies the non-roblox rules after the main
			// item, so it wins for test files outside the roblox scope.
			...(complementIgnores
				? [
						{
							name: "isentinel/test/jest/rules/complement",
							files: jestFiles,
							ignores: [...(jestOptions.ignores ?? []), ...complementIgnores],
							rules: jestItemRules(false),
							settings: jestSettings,
						},
					]
				: []),
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

		const vitestFiles = vitestOptions.files ?? files;
		const vitestItemRules = (roblox: boolean): TypedFlatConfigItem["rules"] => {
			return {
				...vitestRules({ extended: useJestExtended, isInEditor, stylistic }),
				...sonarjsTestRules({ roblox }),

				...overrides,
				...vitestOptions.overrides,
			};
		};

		const vitestSettings = {
			...(useJestExtended ? { jest: { globalPackage: "vitest" } } : {}),
			vitest: {
				typecheck: vitestOptions.typecheck ?? false,
			},
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
				files: vitestFiles,
				...(vitestOptions.ignores ? { ignores: vitestOptions.ignores } : {}),
				rules: vitestItemRules(isRoblox),
				settings: vitestSettings,
			},
			...(complementIgnores
				? [
						{
							name: "isentinel/test/vitest/rules/complement",
							files: vitestFiles,
							ignores: [...(vitestOptions.ignores ?? []), ...complementIgnores],
							rules: vitestItemRules(false),
							settings: vitestSettings,
						},
					]
				: []),
			{
				name: "isentinel/test/vitest/type-tests",
				files: [GLOB_TYPE_TESTS],
				rules: typeTestRules("vitest"),
			},
		);
	}

	return configs;
}
