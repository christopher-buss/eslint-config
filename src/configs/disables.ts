import { GLOB_BUILD_TOOLS, GLOB_DTS, GLOB_SRC, GLOB_SRC_EXT, GLOB_TESTS } from "../globs";
import type { TypedFlatConfigItem } from "../types";

export async function disables(): Promise<Array<TypedFlatConfigItem>> {
	return [
		{
			files: [`**/scripts/${GLOB_SRC}`],
			name: "isentinel/disables/scripts",
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
				"ts/explicit-function-return-type": "off",
			},
		},
		{
			files: [`**/cli/${GLOB_SRC}`, `**/cli.${GLOB_SRC_EXT}`],
			name: "isentinel/disables/cli",
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
			},
		},
		{
			files: GLOB_BUILD_TOOLS,
			name: "isentinel/disables/build-tools",
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
				"ts/explicit-function-return-type": "off",
			},
		},
		{
			files: ["**/bin/**/*", `**/bin.${GLOB_SRC_EXT}`],
			name: "isentinel/disables/bin",
			rules: {
				"antfu/no-import-dist": "off",
				"antfu/no-import-node-modules-by-path": "off",
			},
		},
		{
			files: [GLOB_DTS],
			name: "isentinel/disables/dts",
			rules: {
				"eslint-comments/no-unlimited-disable": "off",
				"import/no-default-export": "off",
				"import/no-duplicates": "off",
				"max-lines": "off",
				"no-restricted-syntax": "off",
				"sonar/no-duplicate-string": "off",
				"unused-imports/no-unused-vars": "off",
			},
		},
		{
			files: [...GLOB_TESTS],
			name: "isentinel/disables/test",
			rules: {
				"antfu/no-top-level-await": "off",
				"max-lines": "off",
				"max-lines-per-function": "off",
				"no-unused-expressions": "off",
				"ts/explicit-function-return-type": "off",
				"ts/no-non-null-assertion": "off",
			},
		},
		{
			files: ["**/*.js", "**/*.cjs"],
			name: "isentinel/disables/cjs",
			rules: {
				"ts/no-require-imports": "off",
			},
		},
		{
			files: ["*.?([cm])[jt]s?(x)", `*.md/${GLOB_SRC}`],
			name: "isentinel/disables/root",
			rules: {
				"sonar/file-name-differ-from-class": "off",
				"unicorn/filename-case": "off",
			},
		},
	];
}
