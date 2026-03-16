import {
	GLOB_BUILD_TOOLS,
	GLOB_DTS,
	GLOB_SRC,
	GLOB_SRC_EXT,
	GLOB_TESTS,
	GLOB_YAML,
} from "../../globs.ts";
import type { TypedOxlintConfigItem } from "../../types.ts";

export function oxlintDisables(options: { root: Array<string> }): Array<TypedOxlintConfigItem> {
	const { root } = options;

	// Inlined from disables(), with:
	// - ts/* → typescript/*
	// - unprefixed core rules → eslint/
	// - unsupported plugin rules removed (cease-nonsense, eslint-comments,
	//   roblox, unused-imports)

	return [
		{
			name: "isentinel/disables/scripts",
			files: [`**/scripts/${GLOB_SRC}`],
			rules: {
				"antfu/no-top-level-await": "off",
				"eslint/no-console": "off",
				"typescript/explicit-function-return-type": "off",
			},
		},
		{
			name: "isentinel/disables/cli",
			files: [`**/cli/${GLOB_SRC}`, `**/cli.${GLOB_SRC_EXT}`],
			rules: {
				"antfu/no-top-level-await": "off",
				"eslint/no-console": "off",
			},
		},
		{
			name: "isentinel/disables/build-tools",
			files: GLOB_BUILD_TOOLS,
			rules: {
				"antfu/no-top-level-await": "off",
				"eslint/no-console": "off",
				"typescript/explicit-function-return-type": "off",
			},
		},
		{
			name: "isentinel/disables/bin",
			files: ["**/bin/**/*", `**/bin.${GLOB_SRC_EXT}`],
			rules: {
				"antfu/no-import-dist": "off",
				"antfu/no-import-node-modules-by-path": "off",
			},
		},
		{
			name: "isentinel/disables/dts",
			files: [GLOB_DTS],
			rules: {
				"eslint/max-lines": "off",
				"eslint/no-restricted-syntax": "off",
				"import/no-duplicates": "off",
				"sonar/no-duplicate-string": "off",
			},
		},
		{
			name: "isentinel/disables/test",
			files: [...GLOB_TESTS],
			rules: {
				"antfu/no-top-level-await": "off",
				"eslint/max-lines": "off",
				"eslint/max-lines-per-function": "off",
				"eslint/no-empty-function": "off",
				"eslint/no-unused-expressions": "off",
				"sonar/no-duplicate-string": "off",
				"typescript/explicit-function-return-type": "off",
				"typescript/no-empty-function": "off",
				"typescript/no-non-null-assertion": "off",
				"typescript/unbound-method": "off",
				"unicorn/consistent-function-scoping": "off",
			},
		},
		{
			name: "isentinel/disables/cjs",
			files: ["**/*.js", "**/*.cjs"],
			rules: {
				"typescript/no-require-imports": "off",
			},
		},
		{
			name: "isentinel/disables/root",
			files: [...root, `*.md/${GLOB_SRC}`],
			rules: {
				"sonar/file-name-differ-from-class": "off",
				"unicorn/filename-case": "off",
			},
		},
		{
			name: "isentinel/disables/yaml",
			files: [GLOB_YAML],
			rules: {
				"eslint/no-inline-comments": "off",
			},
		},
	];
}
