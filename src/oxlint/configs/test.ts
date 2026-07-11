import { GLOB_TESTS } from "../../globs.ts";
import { jestRules } from "../../rules/test.ts";
import type {
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsJest,
	OptionsOverrides,
	OptionsProjectType,
	OptionsStylistic,
	OptionsTestFramework,
} from "../../types.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

/**
 * Test rules for standalone oxlint.
 *
 * Jest rules run through `eslint-plugin-jest` as a jsPlugin (the native oxlint
 * jest plugin does not support `settings.jest.globalPackage`, see
 * https://github.com/oxc-project/oxc/issues/23290).
 *
 * Vitest rules are NOT emitted: `@vitest/eslint-plugin` crashes under oxlint's
 * jsPlugin runtime ("Cannot add property, object is not extensible" during
 * rule creation). Use ESLint (or hybrid mode) for vitest projects.
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
	const vitestEnabled = vitest === true || typeof vitest === "object";
	const jestOptions: OptionsJest = typeof jest === "object" ? jest : {};
	const jestEnabled = jest === true || typeof jest === "object";
	const enableJest = jestEnabled || (!vitestEnabled && (type === "game" || isRoblox));

	if (!enableJest) {
		return [];
	}

	return createOxlintConfigs({
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
	});
}
