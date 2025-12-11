import {
	GLOB_BUILD_TOOLS,
	GLOB_DTS,
	GLOB_SRC,
	GLOB_SRC_EXT,
	GLOB_TESTS,
	GLOB_YAML,
} from "../globs";
import type { TypedFlatConfigItem } from "../types";

export async function disables(options: {
	root: Array<string>;
}): Promise<Array<TypedFlatConfigItem>> {
	const { root } = options;

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
				"eslint-comments/no-unlimited-disable": "off",
				"import/no-default-export": "off",
				"import/no-duplicates": "off",
				"max-lines": "off",
				"no-restricted-syntax": "off",
				"shopify/prefer-class-properties": "off",
				"sonar/no-duplicate-string": "off",
				"unused-imports/no-unused-vars": "off",
			},
		},
		{
			name: "isentinel/disables/test",
			files: [...GLOB_TESTS],
			rules: {
				"antfu/no-top-level-await": "off",
				"max-lines": "off",
				"max-lines-per-function": "off",
				"no-empty-function": "off",
				"no-unused-expressions": "off",
				"ts/explicit-function-return-type": "off",
				"ts/no-empty-function": "off",
				"ts/no-non-null-assertion": "off",
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
	];
}
