import { GLOB_BIN, GLOB_BUILD_TOOLS, GLOB_DTS, GLOB_SRC } from "../../globs.ts";
import { importsRules } from "../../rules/imports.ts";
import type { OptionsHasRoblox, OptionsStylistic } from "../../types.ts";
import type { OxlintRules, TypedOxlintConfigItem } from "../types.ts";
import { createOxlintConfigs } from "../utils.ts";

/**
 * Files that are CommonJS by convention, where `require`/`module.exports` is
 * the point rather than a mistake.
 */
const GLOB_CJS = ["**/*.js", "**/*.cjs"];

export function oxlintImports({
	excludeFiles,
	roblox = true,
	stylistic = true,
}: OptionsHasRoblox &
	OptionsStylistic & { excludeFiles?: Array<string> } = {}): Array<TypedOxlintConfigItem> {
	const exclude = excludeFiles ?? [];

	return [
		...createOxlintConfigs({
			name: "isentinel/imports",
			...(excludeFiles ? { excludeFiles } : {}),
			files: [GLOB_SRC],
			rules: importsRules({ stylistic }),
		}),
		{
			name: "isentinel/imports/oxlint",
			...(excludeFiles ? { excludeFiles } : {}),
			files: [GLOB_SRC],
			plugins: ["import"],
			rules: {
				"import/consistent-type-specifier-style": "error",
				"import/default": "error",
				"import/export": "error",
				"import/namespace": "error",
				"import/no-absolute-path": "error",
				"import/no-cycle": "error",
				"import/no-duplicates": "error",
				"import/no-empty-named-blocks": "error",
				"import/no-named-as-default": "error",
				"import/no-self-import": "error",

				...(roblox
					? { "import/no-nodejs-modules": "error" }
					: {
							"import/extensions": ["error", "ignorePackages"],
							"import/no-nodejs-modules": "off",
						}),
			} satisfies OxlintRules,
		},
		{
			name: "isentinel/imports/oxlint/esm",
			excludeFiles: [...GLOB_CJS, ...exclude],
			files: [GLOB_SRC],
			plugins: ["import"],
			rules: { "import/no-commonjs": "error" } satisfies OxlintRules,
		},
		{
			name: "isentinel/imports/oxlint/unassigned",
			excludeFiles: [...GLOB_BIN, ...exclude],
			files: [GLOB_SRC],
			plugins: ["import"],
			rules: { "import/no-unassigned-import": "error" } satisfies OxlintRules,
		},
		{
			name: "isentinel/imports/oxlint/default-export",
			excludeFiles: [GLOB_DTS, ...GLOB_BUILD_TOOLS, ...exclude],
			files: [GLOB_SRC],
			plugins: ["import"],
			rules: {
				"import/no-anonymous-default-export": "error",
				"import/no-default-export": "error",
			} satisfies OxlintRules,
		},
	];
}
