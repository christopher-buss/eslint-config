import { findUp } from "find-up-simple";
import path from "node:path";
import process from "node:process";

import type {
	OptionsHasRoblox,
	OptionsProjectType,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";
import { interopDefault } from "../utils.ts";

export async function packageJson(
	options: OptionsHasRoblox & OptionsProjectType & OptionsStylistic = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { roblox = true, stylistic = true, type = "game" } = options;

	const [jsoncEslintParser, pluginPackageJson, rootDirectory] = await Promise.all([
		interopDefault(import("jsonc-eslint-parser")),
		interopDefault(import("eslint-plugin-package-json")),
		findWorkspaceRoot(),
	]);

	const rootOverride: TypedFlatConfigItem = {
		name: "isentinel/package-json/root",
		files: ["package.json"],
		languageOptions: {
			parser: jsoncEslintParser,
		},
		rules: {
			"package-json/require-packageManager": ["error", { ignorePrivate: false }],
		},
	};

	return [
		{
			name: "isentinel/package-json/setup",
			plugins: {
				"package-json": pluginPackageJson,
			},
		},
		{
			name: "isentinel/package-json",
			files: ["**/package.json"],
			languageOptions: {
				parser: jsoncEslintParser,
			},
			rules: {
				"package-json/no-empty-fields": "error",
				"package-json/no-redundant-files": "error",
				"package-json/no-redundant-publishConfig": "error",
				"package-json/repository-shorthand": "error",
				"package-json/require-packageManager": ["error", { ignorePrivate: true }],
				"package-json/require-type": "error",
				"package-json/restrict-private-properties": "error",
				"package-json/restrict-top-level-properties": [
					"error",
					{
						ban: [
							{
								message: "Configure pnpm options in pnpm-workspace.yaml.",
								property: "pnpm",
							},
							{
								message: "Configure prettier options in eslint config",
								property: "prettier",
							},
							{
								message: "Configure commitlint in a dedicated config file.",
								property: "commitlint",
							},
							{
								message: "Configure ESLint in a dedicated config file.",
								property: "eslintConfig",
							},
							{
								message: "Configure Jest in a dedicated config file.",
								property: "jest",
							},
							{
								message: "Configure lint-staged in a dedicated config file.",
								property: "lint-staged",
							},
							{
								message: "Configure Renovate in a renovate config file.",
								property: "renovate",
							},
							{
								message: "Configure nx in the nx.json file.",
								property: "nx",
							},
							{
								message:
									"Configure simple-git-hooks in simple-git-hooks config file.",
								property: "simple-git-hooks",
							},
							{
								message: "Configure release-it in a dedicated config file.",
								property: "release-it",
							},
							{
								message: "Configure Stylelint in a dedicated config file.",
								property: "stylelint",
							},
							{
								message: "Configure TypeDoc in a dedicated config file.",
								property: "typedoc",
							},
						],
					},
				],
				"package-json/specify-peers-locally": "error",
				"package-json/unique-dependencies": "error",
				"package-json/valid-author": "off",
				"package-json/valid-bin": "error",
				"package-json/valid-browser": "error",
				"package-json/valid-bugs": "error",
				"package-json/valid-bundleDependencies": "error",
				"package-json/valid-config": "error",
				"package-json/valid-contributors": "error",
				"package-json/valid-cpu": "error",
				"package-json/valid-dependencies": "error",
				"package-json/valid-description": "error",
				"package-json/valid-devDependencies": "error",
				"package-json/valid-devEngines": "error",
				"package-json/valid-directories": "error",
				"package-json/valid-engines": "error",
				"package-json/valid-exports": "error",
				"package-json/valid-files": "error",
				"package-json/valid-funding": "error",
				"package-json/valid-gypfile": "error",
				"package-json/valid-homepage": "error",
				"package-json/valid-keywords": "error",
				"package-json/valid-libc": "error",
				"package-json/valid-license": "error",
				"package-json/valid-main": "error",
				"package-json/valid-man": "error",
				"package-json/valid-module": "error",
				"package-json/valid-name": "error",
				"package-json/valid-optionalDependencies": "error",
				"package-json/valid-os": "error",
				"package-json/valid-packageManager": "error",
				"package-json/valid-peerDependencies": "error",
				"package-json/valid-peerDependenciesMeta": "error",
				"package-json/valid-peerDependenciesMeta-relationship": "error",
				"package-json/valid-private": "error",
				"package-json/valid-publishConfig": "error",
				"package-json/valid-repository": "error",
				"package-json/valid-repository-directory": "error",
				"package-json/valid-scripts": "error",
				"package-json/valid-sideEffects": "error",
				"package-json/valid-type": "error",
				"package-json/valid-version": "error",
				"package-json/valid-workspaces": "error",

				...(stylistic !== false
					? {
							"package-json/bin-name-casing": "error",
							"package-json/exports-subpaths-style": [
								"error",
								{ prefer: "explicit" },
							],
							"package-json/order-properties": "error",
							"package-json/scripts-name-casing": "error",
							"package-json/sort-collections": "error",
						}
					: {}),

				...(type === "package"
					? {
							"package-json/require-attribution": ["error", { ignorePrivate: true }],
							"package-json/require-bugs": ["error", { ignorePrivate: true }],
							"package-json/require-description": "error",
							"package-json/require-exports": ["error", { ignorePrivate: true }],
							"package-json/require-files": ["error", { ignorePrivate: true }],
							"package-json/require-homepage": ["error", { ignorePrivate: true }],
							"package-json/require-keywords": ["error", { ignorePrivate: true }],
							"package-json/require-license": ["error", { ignorePrivate: true }],
							"package-json/require-name": "error",
							"package-json/require-repository": ["error", { ignorePrivate: true }],
							"package-json/require-types": ["error", { ignorePrivate: true }],
							"package-json/require-version": "error",
						}
					: {}),

				...(type === "package" && !roblox
					? {
							"package-json/require-bin": ["error", { ignorePrivate: true }],
							"package-json/require-engines": "error",
							"package-json/require-sideEffects": ["error", { ignorePrivate: true }],
						}
					: {}),
			},
		},
		// Require packageManager on the workspace root even when it is private.
		// `basePath` anchors the `package.json` glob to the real root directory,
		// so this holds no matter where ESLint resolves the config's base path
		// from. That matters under tools like Nx, which lint each project with
		// its own config base path (the default in ESLint 10 via
		// `v10_config_lookup_from_file`) while the cwd stays at the workspace
		// root - without `basePath`, `["package.json"]` would match every
		// project's own `package.json`.
		{ ...rootOverride, basePath: rootDirectory },
	];
}

/**
 * Resolves the workspace root directory.
 *
 * The root is the directory containing `pnpm-workspace.yaml`. When no workspace
 * file exists anywhere up the tree the project is standalone, so the cwd is its
 * own root.
 *
 * @param cwd - The directory to resolve from, defaulting to the current
 *   working directory.
 * @returns The absolute path of the workspace root directory.
 */
async function findWorkspaceRoot(cwd = process.cwd()): Promise<string> {
	const workspaceFile = await findUp("pnpm-workspace.yaml", { cwd });
	return workspaceFile === undefined ? cwd : path.dirname(workspaceFile);
}
