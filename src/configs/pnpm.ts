import { findUp } from "find-up-simple";
import fs from "node:fs/promises";

import type { OptionsIsInEditor, OptionsPnpm, TypedFlatConfigItem } from "../types";
import { ensurePackages, interopDefault } from "../utils";

export async function pnpm(
	options: OptionsPnpm & Required<OptionsIsInEditor>,
): Promise<Array<TypedFlatConfigItem>> {
	await ensurePackages(["eslint-plugin-pnpm"]);

	const [pluginPnpm, yamlParser, jsoncParser] = await Promise.all([
		interopDefault(import("eslint-plugin-pnpm")),
		interopDefault(import("yaml-eslint-parser")),
		interopDefault(import("jsonc-eslint-parser")),
	]);

	const { catalogs = await detectCatalogUsage(), isInEditor } = options;

	return [
		{
			name: "isentinel/pnpm/setup",
			plugins: {
				pnpm: pluginPnpm,
			},
		},
		{
			name: "isentinel/pnpm/package-json",
			files: ["package.json", "**/package.json"],
			languageOptions: {
				parser: jsoncParser,
			},
			rules: {
				...(catalogs
					? {
							"pnpm/json-enforce-catalog": ["error", { autofix: !isInEditor }],
						}
					: {}),
				"pnpm/json-prefer-workspace-settings": ["error", { autofix: !isInEditor }],
				"pnpm/json-valid-catalog": ["error", { autofix: !isInEditor }],
			},
			settings: {
				pnpm: {
					ensureWorkspaceFile: true,
				},
			},
		},
		{
			name: "isentinel/pnpm/pnpm-workspace-yaml",
			files: ["pnpm-workspace.yaml"],
			languageOptions: {
				parser: yamlParser,
			},
			plugins: {
				pnpm: pluginPnpm,
			},
			rules: {
				"pnpm/yaml-enforce-settings": [
					"error",
					{
						settings: {
							catalogMode: "prefer",
							cleanupUnusedCatalogs: true,
							shellEmulator: true,
							// TODO: Currently our own config is breaking for
							// this making it a pain to use
							// trustPolicy: "no-downgrade",
						},
					},
				],
				"pnpm/yaml-no-duplicate-catalog-item": "error",
				"pnpm/yaml-no-unused-catalog-item": "error",
			},
		},
	];
}

async function detectCatalogUsage(): Promise<boolean> {
	const workspaceFile = await findUp("pnpm-workspace.yaml");
	if (workspaceFile === undefined) {
		return false;
	}

	const yaml = await fs.readFile(workspaceFile, "utf-8");
	return yaml.includes("catalog:") || yaml.includes("catalogs:");
}
