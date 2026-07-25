import { rebaseAncestorAnchor, workspaceRelativeDirectory } from "../../anchors.ts";
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
import { createOxlintConfigs, resolveJsPluginSpecifier } from "../utils.ts";

/**
 * Rule relaxations keyed on where a file lives.
 *
 * @param options - The resolved factory options.
 * @param options.configDirectory - The directory holding the consuming config,
 *   used to widen ancestor-anchored globs. Documented on the factory's
 *   `configDirectory` option.
 * @param options.root - Globs identifying root-level files.
 * @param options.workspaceRoot - Absolute workspace root.
 * @returns The disables configs.
 */
export function oxlintDisables({
	configDirectory,
	root,
	workspaceRoot,
}: {
	configDirectory?: string;
	root: Array<string>;
	workspaceRoot: string;
}): Array<TypedOxlintConfigItem> {
	const relativeConfigDirectory =
		configDirectory === undefined
			? undefined
			: workspaceRelativeDirectory(configDirectory, workspaceRoot);

	return rebaseAnchoredFiles(
		[
			...createOxlintConfigs({
				name: "isentinel/disables/scripts",
				files: [`**/scripts/${GLOB_SRC}`],
				rules: {
					"antfu/no-top-level-await": "off",
					"max-lines": "off",
					"no-console": "off",
					"small-rules/require-async-suffix": "off",
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
					"small-rules/require-async-suffix": "off",
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
					"small-rules/require-async-suffix": "off",
				},
			}),
			...createOxlintConfigs({
				name: "isentinel/disables/dts",
				files: [GLOB_DTS],
				// Preserve the native-only oxc disable below, which is unmapped
				// and would otherwise be dropped.
				keepUnmappedOff: true,
				rules: {
					"max-lines": "off",
					"no-duplicate-imports": "off",
					"no-restricted-syntax": "off",
					// Declaration files have no runtime module-loading cost.
					"oxc/no-barrel-file": "off",
					"roblox/no-namespace-merging": "off",
					"small-rules/prefer-class-properties": "off",
					"sonar/no-duplicate-string": "off",
					"unused-imports/no-unused-vars": "off",
				},
			}),
			{
				name: "isentinel/disables/dts/directives",
				files: [GLOB_DTS],
				jsPlugins: [
					{
						name: "oxlint-comments",
						specifier: resolveJsPluginSpecifier("oxlint-plugin-oxlint-comments"),
					},
				],
				rules: {
					"oxlint-comments/no-unlimited-disable": "off",
				},
			},
			...createOxlintConfigs({
				name: "isentinel/disables/test",
				files: [...GLOB_TESTS],
				rules: {
					"antfu/no-top-level-await": "off",
					"flawless/max-lines-per-function": "off",
					"max-lines": "off",
					"no-empty-function": "off",
					"no-unused-expressions": "off",
					"sonar/no-duplicate-string": "off",
					"ts/explicit-function-return-type": "off",
					"ts/no-empty-function": "off",
					"ts/no-extraneous-class": "off",
					"ts/no-non-null-assertion": "off",
					"ts/require-await": "off",
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
					"import/no-default-export": "off",
					"small-rules/require-async-suffix": "off",
					"sonar/file-name-differ-from-class": "off",
					"unicorn/filename-case": "off",
				},
			}),
			...createOxlintConfigs({
				name: "isentinel/disables/jsx",
				files: [GLOB_JSX, GLOB_TSX],
				rules: {
					"flawless/max-lines-per-function": "off",
				},
			}),
		],
		relativeConfigDirectory,
	);
}

/**
 * Rewrites ancestor-anchored `files` globs so they still match from a nested
 * config.
 *
 * Applied to every block rather than a curated list, so a block added later
 * with a directory anchor is covered without anyone remembering to opt it in.
 * Patterns that are not ancestor-anchored pass through untouched.
 *
 * @param configs - The configs to rewrite.
 * @param relativeConfigDirectory - The config's directory relative to the workspace
 *   root, or `undefined` when it is the workspace root or outside it.
 * @returns The configs, with anchored globs widened.
 */
function rebaseAnchoredFiles(
	configs: Array<TypedOxlintConfigItem>,
	relativeConfigDirectory: string | undefined,
): Array<TypedOxlintConfigItem> {
	if (relativeConfigDirectory === undefined) {
		return configs;
	}

	return configs.map((config) => {
		const rebased = config.files.flatMap((pattern) => {
			return rebaseAncestorAnchor(pattern, relativeConfigDirectory);
		});

		return { ...config, files: [...new Set(rebased)] };
	});
}
