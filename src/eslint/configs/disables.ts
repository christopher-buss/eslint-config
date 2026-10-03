import {
	GLOB_BIN,
	GLOB_BUILD_CONFIGS,
	GLOB_DTS,
	GLOB_JSX,
	GLOB_SRC,
	GLOB_SRC_EXT,
	GLOB_TESTS,
	GLOB_TSX,
	GLOB_YAML,
} from "../../globs.ts";
import type { TypedFlatConfigItem } from "../types.ts";

/**
 * Rule relaxations keyed on where a file lives.
 *
 * Blocks whose `files` patterns anchor on an ancestor directory name pin
 * `basePath` to the workspace root. Without it they are silently dead in every
 * project that has its own `eslint.config.*`: ESLint 10 resolves the config
 * nearest each linted file and matches `files` against that config's directory,
 * so `**\/scripts/` never appears in the path being tested. Pinning can only
 * widen what these blocks match, and they contain nothing but `"off"`, so it
 * cannot introduce a new error.
 *
 * `disables/root` is deliberately left unpinned — its patterns are relative by
 * design, so under a nested config they resolve to that project's own top-level
 * files, which is exactly the intent.
 *
 * @param options - The resolved factory options.
 * @param options.root - Globs identifying root-level files.
 * @param options.workspaceRoot - Absolute workspace root, used as the base path
 *   for ancestor-anchored blocks.
 * @returns The disables configs.
 */
export function disables({
	root,
	workspaceRoot,
}: {
	root: Array<string>;
	workspaceRoot: string;
}): Array<TypedFlatConfigItem> {
	return [
		{
			name: "isentinel/disables/scripts",
			basePath: workspaceRoot,
			files: [`**/scripts/${GLOB_SRC}`, "**/.github/scripts/**/*"],
			rules: {
				"antfu/no-top-level-await": "off",
				"max-lines": "off",
				"no-console": "off",
				"small-rules/require-async-suffix": "off",
				"ts/explicit-function-return-type": "off",
			},
		},
		{
			name: "isentinel/disables/cli",
			basePath: workspaceRoot,
			files: [`**/cli/${GLOB_SRC}`, `**/cli.${GLOB_SRC_EXT}`],
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
			},
		},
		{
			name: "isentinel/disables/build-configs",
			basePath: workspaceRoot,
			files: GLOB_BUILD_CONFIGS,
			rules: {
				"antfu/no-top-level-await": "off",
				"no-console": "off",
				"roblox/no-null": "off",
				"small-rules/require-async-suffix": "off",
				"ts/explicit-function-return-type": "off",
				"unicorn/no-null": "off",
			},
		},
		{
			name: "isentinel/disables/bin",
			basePath: workspaceRoot,
			files: GLOB_BIN,
			rules: {
				"antfu/no-import-dist": "off",
				"antfu/no-import-node-modules-by-path": "off",
				"antfu/no-top-level-await": "off",
				"small-rules/require-async-suffix": "off",
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
			basePath: workspaceRoot,
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
				"unicorn/no-null": "off",
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
