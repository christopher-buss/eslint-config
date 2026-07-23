import {
	GLOB_BIN,
	GLOB_BUILD_TOOLS,
	GLOB_DTS,
	GLOB_JSX,
	GLOB_SRC,
	GLOB_SRC_EXT,
	GLOB_TESTS,
	GLOB_TSX,
	GLOB_YAML,
} from "../../globs.ts";
import type { TypedFlatConfigItem } from "../types.ts";

export function disables({ root }: { root: Array<string> }): Array<TypedFlatConfigItem> {
	return [
		{
			name: "isentinel/disables/scripts",
			files: [`**/scripts/${GLOB_SRC}`],
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
				"ts/explicit-function-return-type": "off",
			},
		},
		{
			name: "isentinel/disables/cli",
			files: [`**/cli/${GLOB_SRC}`, `**/cli.${GLOB_SRC_EXT}`],
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
			},
		},
		{
			name: "isentinel/disables/build-tools",
			files: GLOB_BUILD_TOOLS,
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
				"ts/explicit-function-return-type": "off",
			},
		},
		{
			name: "isentinel/disables/bin",
			files: GLOB_BIN,
			rules: {
				"antfu/no-import-dist": "off",
				"antfu/no-import-node-modules-by-path": "off",
				"antfu/no-top-level-await": "off",
			},
		},
		{
			name: "isentinel/disables/dts",
			files: [GLOB_DTS],
			rules: {
				"eslint-comments/no-unlimited-disable": "off",
				"import/no-default-export": "off",
				"max-lines": "off",
				"no-duplicate-imports": "off",
				"no-restricted-syntax": "off",
				"roblox/no-namespace-merging": "off",
				"small-rules/prefer-class-properties": "off",
				"sonar/no-duplicate-string": "off",
				"unused-imports/no-unused-vars": "off",
			},
		},
		{
			name: "isentinel/disables/test",
			files: [...GLOB_TESTS],
			rules: {
				"antfu/no-top-level-await": "off",
				"e18e/prefer-static-regex": "off",
				"flawless/max-lines-per-function": "off",
				"max-lines": "off",
				"no-empty-function": "off",
				"no-unused-expressions": "off",
				"sonar/no-duplicate-string": "off",
				"ts/explicit-function-return-type": "off",
				"ts/no-empty-function": "off",
				"ts/no-extraneous-class": "off",
				"ts/no-non-null-assertion": "off",
				"ts/no-unused-expressions": "off",
				"ts/require-await": "off",
				"ts/unbound-method": "off",
				"unicorn/consistent-function-scoping": "off",
			},
		},
		{
			name: "isentinel/disables/cjs",
			files: ["**/*.js", "**/*.cjs"],
			rules: {
				"ts/no-require-imports": "off",
			},
		},
		{
			name: "isentinel/disables/root",
			files: [...root, `*.md/${GLOB_SRC}`],
			rules: {
				"import/no-default-export": "off",
				"small-rules/require-async-suffix": "off",
				"sonar/file-name-differ-from-class": "off",
				"unicorn/filename-case": "off",
			},
		},
		{
			name: "isentinel/disables/yaml",
			files: [GLOB_YAML],
			rules: {
				"no-inline-comments": "off",
			},
		},
		{
			name: "isentinel/disables/jsx",
			files: [GLOB_JSX, GLOB_TSX],
			rules: {
				"flawless/max-lines-per-function": "off",
			},
		},
	];
}
