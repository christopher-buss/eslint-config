import { GLOB_TESTS, GLOB_TYPE_TESTS } from "../../globs.ts";
import { smallRulesTestRules } from "../../rules/small-rules.ts";
import { sonarjsTestRules } from "../../rules/sonarjs.ts";
import { jestRules, typeTestRules, vitestRules } from "../../rules/test.ts";
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
 * Jest runs through `eslint-plugin-jest` as a jsPlugin: the native oxlint
 * jest plugin does not support `settings.jest.globalPackage`
 * (https://github.com/oxc-project/oxc/issues/23290). Vitest runs as native
 * oxlint rules, except `padding-around-all` and `prefer-vi-mocked` (no
 * native port) which run via `@vitest/eslint-plugin` as a jsPlugin. The
 * four type-aware jest rules are filtered out because oxlint has no type
 * information for them.
 *
 * @param options - The test rule options.
 * @returns The generated config fragments.
 */
export function oxlintTest({
	excludeFiles,
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
		 * When set, also re-apply the non-roblox rules to every test file
		 * except these globs (the roblox scope). The framework choice stays
		 * the same.
		 */
		excludeFiles?: Array<string>;
	} = {}): Array<TypedOxlintConfigItem> {
	const vitestOptions: OptionsVitest = typeof vitest === "object" ? vitest : {};
	const vitestEnabled = vitest === true || typeof vitest === "object";
	const jestOptions: OptionsJest = typeof jest === "object" ? jest : {};
	const jestEnabled = jest === true || typeof jest === "object";
	const enableJest = jestEnabled || (!vitestEnabled && (type === "game" || isRoblox));
	const enableVitest = vitestEnabled || (!jestEnabled && type === "package" && !isRoblox);

	const configs: Array<TypedOxlintConfigItem> = [];

	if (enableJest) {
		const jestFragments = (complement: boolean): Array<TypedOxlintConfigItem> => {
			const roblox = complement ? false : isRoblox;

			return createOxlintConfigs({
				name: complement ? "isentinel/test/jest/complement" : "isentinel/test/jest",
				...(complement ? { excludeFiles } : {}),
				files: jestOptions.files?.flat() ?? files.flat(),
				overrides: { ...overrides, ...jestOptions.overrides },
				rules: {
					...jestRules({
						extended: jestOptions.extended === true,
						isInEditor,
						roblox,
						stylistic,
					}),
					...sonarjsTestRules({ jest: true, roblox }),
					...smallRulesTestRules(),
				},
				settings: {
					jest: {
						globalPackage: "@rbxts/jest-globals",
						version: 27,
					},
				},
			});
		};

		configs.push(
			...jestFragments(false),
			// The complement re-applies the non-roblox rules after the main
			// fragment, so it wins for test files outside the roblox scope.
			...(excludeFiles ? jestFragments(true) : []),
			...createOxlintConfigs({
				name: "isentinel/test/jest/type-tests",
				files: [GLOB_TYPE_TESTS],
				keepUnmappedOff: true,
				rules: typeTestRules("jest"),
			}),
		);
	}

	if (enableVitest) {
		const vitestFragments = (complement: boolean): Array<TypedOxlintConfigItem> => {
			const roblox = complement ? false : isRoblox;

			return createOxlintConfigs({
				name: complement ? "isentinel/test/vitest/complement" : "isentinel/test/vitest",
				...(complement ? { excludeFiles } : {}),
				files: vitestOptions.files?.flat() ?? files.flat(),
				overrides: { ...overrides, ...vitestOptions.overrides },
				rules: {
					...vitestRules({
						extended: vitestOptions.extended === true,
						isInEditor,
						stylistic,
					}),
					...sonarjsTestRules({ roblox }),
				},
				settings: {
					vitest: {
						typecheck: vitestOptions.typecheck ?? false,
					},
				},
			});
		};

		configs.push(
			...vitestFragments(false),
			...(excludeFiles ? vitestFragments(true) : []),
			...createOxlintConfigs({
				name: "isentinel/test/vitest/type-tests",
				files: [GLOB_TYPE_TESTS],
				keepUnmappedOff: true,
				rules: typeTestRules("vitest"),
			}),
		);
	}

	return configs;
}
