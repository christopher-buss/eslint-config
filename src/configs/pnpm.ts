import type { OptionsIsInEditor, TypedFlatConfigItem } from "../types";
import { ensurePackages, interopDefault } from "../utils";

export async function pnpm(
	options: Required<OptionsIsInEditor>,
): Promise<Array<TypedFlatConfigItem>> {
	const { isInEditor } = options;

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
				"pnpm/json-enforce-catalog": ["error", { autofix: !isInEditor }],
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
							trustPolicy: "no-downgrade",
						},
					},
				],
				"pnpm/yaml-no-duplicate-catalog-item": "error",
				"pnpm/yaml-no-unused-catalog-item": "error",
			},
		},
	];
}
