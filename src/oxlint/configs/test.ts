import { GLOB_TESTS } from "../../globs.ts";
import { jestRules, vitestRules } from "../../rules/test.ts";
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
} from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

/**
 * Test rules for standalone oxlint.
 *
 * Both frameworks run through their real ESLint plugin as a jsPlugin: the
 * native oxlint jest plugin does not support `settings.jest.globalPackage`
 * (https://github.com/oxc-project/oxc/issues/23290), and running the plugins
 * directly keeps the rule set identical to the ESLint side. The type-aware
 * rules (`vitest/require-mock-type-parameters` and the four jest rules) are
 * filtered out by the oxlint factory because jsPlugins have no type information.
 *
 * @param options - The test rule options.
 * @returns The generated config fragments.
 */
export function oxlintTest({
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
	OptionsTestFramework = {}): Array<TypedOxlintConfigItem> {
	const vitestOptions: OptionsVitest = typeof vitest === "object" ? vitest : {};
	const vitestEnabled = vitest === true || typeof vitest === "object";
	const jestOptions: OptionsJest = typeof jest === "object" ? jest : {};
	const jestEnabled = jest === true || typeof jest === "object";
	const enableJest = jestEnabled || (!vitestEnabled && (type === "game" || isRoblox));
	const enableVitest = vitestEnabled || (!jestEnabled && type === "package" && !isRoblox);

	const configs: Array<TypedOxlintConfigItem> = [];

	if (enableJest) {
		configs.push(
			...createOxlintConfigs({
				name: "isentinel/test/jest",
				files: jestOptions.files?.flat() ?? files.flat(),
				rules: {
					...jestRules({
						extended: jestOptions.extended === true,
						isInEditor,
						roblox: isRoblox,
						stylistic,
					}),
					...overrides,
					...jestOptions.overrides,
				},
				settings: {
					jest: {
						globalPackage: "@rbxts/jest-globals",
						version: 27,
					},
				},
			}),
		);
	}

	if (enableVitest) {
		configs.push(
			...createOxlintConfigs({
				name: "isentinel/test/vitest",
				files: vitestOptions.files?.flat() ?? files.flat(),
				rules: {
					...vitestRules({
						extended: vitestOptions.extended === true,
						isInEditor,
						stylistic,
					}),
					...overrides,
					...vitestOptions.overrides,
				},
				settings: {
					vitest: {
						typecheck: vitestOptions.typecheck ?? false,
					},
				},
			}),
		);
	}

	return configs;
}
