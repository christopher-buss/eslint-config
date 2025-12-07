import type { TypedFlatConfigItem } from "../types";
import { ensurePackages, interopDefault } from "../utils";

export async function pnpm(): Promise<Array<TypedFlatConfigItem>> {
	await ensurePackages(["eslint-plugin-pnpm"]);

	const [pluginPnpm, yamlParser, jsoncParser] = await Promise.all([
		interopDefault(import("eslint-plugin-pnpm")),
		interopDefault(import("yaml-eslint-parser")),
		interopDefault(import("jsonc-eslint-parser")),
	]);

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
				"pnpm/json-enforce-catalog": "error",
				"pnpm/json-prefer-workspace-settings": "error",
				"pnpm/json-valid-catalog": "error",
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
				"pnpm/yaml-no-duplicate-catalog-item": "error",
				"pnpm/yaml-no-unused-catalog-item": "error",
			},
		},
	];
}
