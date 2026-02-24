import {
	GLOB_BUILD_TOOLS,
	GLOB_DTS,
	GLOB_SRC,
	GLOB_SRC_EXT,
	GLOB_TESTS,
	GLOB_YAML,
} from "../globs.ts";
import type { Rules, TypedFlatConfigItem, TypedOxlintConfigItem } from "../types.ts";

export function disables(options: { root: Array<string> }): Array<TypedFlatConfigItem> {
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
				"cease-nonsense/prefer-class-properties": "off",
				"eslint-comments/no-unlimited-disable": "off",
				"import/no-default-export": "off",
				"import/no-duplicates": "off",
				"max-lines": "off",
				"no-restricted-syntax": "off",
				"roblox/no-namespace-merging": "off",
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
				"sonar/no-duplicate-string": "off",
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

export function oxlintDisables(options: { root: Array<string> }): Array<TypedOxlintConfigItem> {
	const unsupportedPlugins = new Set([
		"cease-nonsense",
		"eslint-comments",
		"roblox",
		"unused-imports",
	]);

	return disables(options).map((config) => {
		const renamedRules: Rules = {};
		for (const [key, value] of Object.entries(config.rules ?? {})) {
			const plugin = key.includes("/") ? key.slice(0, key.indexOf("/")) : undefined;
			if (plugin !== undefined && unsupportedPlugins.has(plugin)) {
				continue;
			}

			if (key.startsWith("ts/")) {
				renamedRules[`typescript/${key.slice(3)}`] = value;
			} else if (plugin === undefined) {
				renamedRules[`eslint/${key}`] = value;
			} else {
				renamedRules[key] = value;
			}
		}

		return { ...config, rules: renamedRules } as TypedOxlintConfigItem;
	});
}
