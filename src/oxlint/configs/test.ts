import { GLOB_TESTS } from "../../globs.ts";
import type {
	OptionsFiles,
	OptionsHasRoblox,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsProjectType,
	OptionsStylistic,
	OptionsTestFramework,
	Rules,
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
		isInEditor: _isInEditor = false,
		jest = false,
		// overrides = {},
		roblox: isRoblox = true,
		stylistic: _stylistic = true,
		type = "game",
		vitest = false,
	} = options;

	// const vitestOptions: OptionsVitest = typeof vitest === "object" ? vitest :
	// {};
	const vitestEnabled = vitest === true || typeof vitest === "object";
	// const jestOptions: OptionsJest = typeof jest === "object" ? jest : {};
	const jestEnabled = jest === true || typeof jest === "object";
	// const enableJest = jestEnabled || (!vitestEnabled && (type === "game" ||
	// isRoblox));
	const enableVitest = vitestEnabled || (!jestEnabled && type === "package" && !isRoblox);

	const configs: Array<TypedOxlintConfigItem> = [];

	if (enableVitest) {
		// Inlined from vitestRules(), filtered to only oxlint-supported rules.
		//
		// TODO(oxlint): most vitest rules not yet implemented
		// Only these are supported: consistent-each-for,
		// consistent-test-filename, consistent-vitest-vi, hoisted-apis-on-top,
		// no-conditional-tests, no-import-node-test,
		// prefer-describe-function-title, prefer-expect-type-of,
		// prefer-import-in-mock, prefer-to-be-object,
		// require-local-test-context-for-concurrent-snapshots

		const rules: Rules = {
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
		};

		configs.push({
			name: "isentinel/test/vitest",
			files: files.flat(),
			plugins: ["vitest"],
			rules,
			// settings : how?
		});
	}

	return configs;
}
