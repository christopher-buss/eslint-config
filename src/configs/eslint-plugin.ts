import { GLOB_TS, GLOB_TSX } from "../globs";
import type { OptionsOverrides, TypedFlatConfigItem } from "../types";
import { ensurePackages, interopDefault } from "../utils";

export async function eslintPlugin(
	options: OptionsOverrides = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { overrides } = options;

	await ensurePackages(["eslint-plugin-eslint-plugin"]);

	const pluginEslintPlugin = await interopDefault(import("eslint-plugin-eslint-plugin"));

	return [
		{
			name: "isentinel/eslint/setup",
			plugins: {
				"eslint-plugin": pluginEslintPlugin,
			},
		},
		{
			files: [GLOB_TS, GLOB_TSX],
			rules: {
				"eslint-plugin/consistent-output": "error",
				"eslint-plugin/fixer-return": "error",
				"eslint-plugin/meta-property-ordering": "off",
				"eslint-plugin/no-deprecated-context-methods": "error",
				"eslint-plugin/no-deprecated-report-api": "error",
				"eslint-plugin/no-identical-tests": "error",
				"eslint-plugin/no-meta-replaced-by": "error",
				"eslint-plugin/no-meta-schema-default": "error",
				"eslint-plugin/no-missing-message-ids": "error",
				"eslint-plugin/no-missing-placeholders": "error",
				"eslint-plugin/no-only-tests": "error",
				"eslint-plugin/no-property-in-node": "error",
				"eslint-plugin/no-unused-message-ids": "error",
				"eslint-plugin/no-unused-placeholders": "error",
				"eslint-plugin/no-useless-token-range": "error",
				"eslint-plugin/prefer-message-ids": "error",
				"eslint-plugin/prefer-object-rule": "error",
				"eslint-plugin/prefer-output-null": "error",
				"eslint-plugin/prefer-placeholders": "error",
				"eslint-plugin/prefer-replace-text": "error",
				"eslint-plugin/report-message-format": "error",
				"eslint-plugin/require-meta-default-options": "error",
				"eslint-plugin/require-meta-docs-description": [
					"error",
					{
						pattern: "^(Enforce|Require|Disallow).*[^\.!]$",
					},
				],
				"eslint-plugin/require-meta-docs-recommended": "error",
				"eslint-plugin/require-meta-docs-url": "off",
				"eslint-plugin/require-meta-fixable": "error",
				"eslint-plugin/require-meta-has-suggestions": "error",
				"eslint-plugin/require-meta-schema": "error",
				"eslint-plugin/require-meta-schema-description": "error",
				"eslint-plugin/require-meta-type": "error",
				"eslint-plugin/test-case-property-ordering": "error",
				"eslint-plugin/test-case-shorthand-strings": "error",

				...overrides,
			},
		},
	];
}
