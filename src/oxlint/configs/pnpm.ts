import { detectCatalogUsage } from "../../utils.ts";
import type {
	JsPluginRules,
	OptionsIsInEditor,
	OptionsPnpm,
	TypedOxlintConfigItem,
} from "../types.ts";

export function oxlintPnpm(
	options: OptionsPnpm & Required<OptionsIsInEditor>,
): Array<TypedOxlintConfigItem> {
	const { catalogs = detectCatalogUsage(), isInEditor } = options;

	const packageJsonRules = {
		...(catalogs
			? {
					"pnpm/json-enforce-catalog": ["error", { autofix: !isInEditor }],
				}
			: {}),
		"pnpm/json-prefer-workspace-settings": ["error", { autofix: !isInEditor }],
		"pnpm/json-valid-catalog": ["error", { autofix: !isInEditor }],
	} satisfies JsPluginRules;

	const workspaceYamlRules = {
		"pnpm/yaml-enforce-settings": [
			"error",
			{
				settings: {
					catalogMode: "prefer",
					shellEmulator: true,
					// TODO: Currently our own config is breaking for
					// this making it a pain to use
					// trustPolicy: "no-downgrade",
				},
			},
		],
		"pnpm/yaml-no-duplicate-catalog-item": "error",
		"pnpm/yaml-no-unused-catalog-item": "error",
	} as const satisfies JsPluginRules;

	const pnpmPlugin = [{ name: "pnpm", specifier: "eslint-plugin-pnpm" }] as const;

	return [
		{
			name: "isentinel/oxlint/pnpm/package-json",
			files: ["package.json", "**/package.json"],
			jsPlugins: [...pnpmPlugin],
			rules: packageJsonRules,
			settings: {
				pnpm: {
					ensureWorkspaceFile: true,
				},
			},
		},
		{
			name: "isentinel/oxlint/pnpm/pnpm-workspace-yaml",
			files: ["pnpm-workspace.yaml"],
			jsPlugins: [...pnpmPlugin],
			rules: workspaceYamlRules,
		},
	];
}
