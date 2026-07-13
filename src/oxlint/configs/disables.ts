import {
	GLOB_BUILD_TOOLS,
	GLOB_DTS,
	GLOB_JSX,
	GLOB_SRC,
	GLOB_SRC_EXT,
	GLOB_TESTS,
	GLOB_TSX,
} from "../../globs.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

export function oxlintDisables({ root }: { root: Array<string> }): Array<TypedOxlintConfigItem> {
	return [
		...createOxlintConfigs({
			name: "isentinel/disables/scripts",
			files: [`**/scripts/${GLOB_SRC}`],
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
				"ts/explicit-function-return-type": "off",
			},
		}),
		...createOxlintConfigs({
			name: "isentinel/disables/cli",
			files: [`**/cli/${GLOB_SRC}`, `**/cli.${GLOB_SRC_EXT}`],
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
			},
		}),
		...createOxlintConfigs({
			name: "isentinel/disables/build-tools",
			files: GLOB_BUILD_TOOLS,
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
				"ts/explicit-function-return-type": "off",
			},
		}),
		...createOxlintConfigs({
			name: "isentinel/disables/bin",
			files: ["**/bin/**/*", `**/bin.${GLOB_SRC_EXT}`],
			rules: {
				"antfu/no-import-dist": "off",
				"antfu/no-import-node-modules-by-path": "off",
				"antfu/no-top-level-await": "off",
			},
		}),
		...createOxlintConfigs({
			name: "isentinel/disables/dts",
			files: [GLOB_DTS],
			rules: {
				"cease-nonsense/prefer-class-properties": "off",
				"max-lines": "off",
				"no-duplicate-imports": "off",
				"no-restricted-syntax": "off",
				"roblox/no-namespace-merging": "off",
				"sonar/no-duplicate-string": "off",
				"unused-imports/no-unused-vars": "off",
			},
		}),
		{
			name: "isentinel/disables/dts/directives",
			files: [GLOB_DTS],
			jsPlugins: [{ name: "oxlint-comments", specifier: "oxlint-plugin-oxlint-comments" }],
			rules: {
				"oxlint-comments/no-unlimited-disable": "off",
			},
		},
		...createOxlintConfigs({
			name: "isentinel/disables/test",
			files: [...GLOB_TESTS],
			rules: {
				"antfu/no-top-level-await": "off",
				"max-lines": "off",
				"max-lines-per-function": "off",
				"no-empty-function": "off",
				"no-unused-expressions": "off",
				"sonar/no-duplicate-string": "off",
				"ts/explicit-function-return-type": "off",
				"ts/no-empty-function": "off",
				"ts/no-extraneous-class": "off",
				"ts/no-non-null-assertion": "off",
				"ts/unbound-method": "off",
				"unicorn/consistent-function-scoping": "off",
			},
		}),
		...createOxlintConfigs({
			name: "isentinel/disables/cjs",
			files: ["**/*.js", "**/*.cjs"],
			rules: {
				"ts/no-require-imports": "off",
			},
		}),
		...createOxlintConfigs({
			name: "isentinel/disables/root",
			files: [...root],
			rules: {
				"sonar/file-name-differ-from-class": "off",
				"unicorn/filename-case": "off",
			},
		}),
		...createOxlintConfigs({
			name: "isentinel/disables/jsx",
			files: [GLOB_JSX, GLOB_TSX],
			rules: {
				"max-lines-per-function": "off",
			},
		}),
	];
}
