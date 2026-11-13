import { GLOB_YAML } from "../../globs.ts";
import { interopDefault } from "../../utils.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type {
	OptionsFiles,
	OptionsFormatters,
	OptionsOverrides,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";

export async function yaml({
	files = [GLOB_YAML, "**/github-actions-workflow"],
	overrides = {},
	prettierOptions = {},
	stylistic = true,
}: OptionsFiles & OptionsFormatters & OptionsOverrides & OptionsStylistic = {}): Promise<
	Array<TypedFlatConfigItem>
> {
	const eslintPluginFlawless = lazyPlugin("eslint-plugin-flawless");
	const [pluginYaml, parserYaml] = await Promise.all([
		interopDefault(import("eslint-plugin-yml")),
		interopDefault(import("yaml-eslint-parser")),
	] as const);

	return [
		{
			name: "isentinel/yaml/setup",
			plugins: {
				flawless: eslintPluginFlawless,
				yaml: pluginYaml,
			},
		},
		{
			name: "isentinel/yaml/rules",
			files,
			language: "yaml/yaml",
			languageOptions: {
				parser: parserYaml,
			},
			rules: {
				"style/spaced-comment": "off",
				"yaml/block-sequence": "error",
				"yaml/file-extension": "error",
				"yaml/no-empty-key": "error",
				"yaml/no-empty-sequence-entry": "error",
				"yaml/no-irregular-whitespace": "error",
				"yaml/plain-scalar": "error",

				...(stylistic !== false
					? {
							"flawless/yaml-block-key-blank-lines": "error",

							"style/max-len": [
								"error",
								{
									code: prettierOptions.printWidth ?? 100,
									comments: Number(prettierOptions["jsdocPrintWidth"]) || 80,
									ignorePattern: String.raw`^\s*(?:-\s+)?uses:\s`,
									ignoreUrls: true,
									tabWidth: 2,
								},
							],

							"yaml/block-mapping": "error",
							"yaml/block-mapping-colon-indicator-newline": "error",
							"yaml/block-mapping-question-indicator-newline": "error",
							"yaml/block-sequence-hyphen-indicator-newline": "error",
							"yaml/flow-mapping-curly-newline": "error",
							"yaml/flow-mapping-curly-spacing": "off",
							"yaml/flow-sequence-bracket-newline": "error",
							"yaml/flow-sequence-bracket-spacing": "error",
							"yaml/key-spacing": "error",
							"yaml/no-tab-indent": "error",
							"yaml/no-trailing-zeros": "error",
							"yaml/sort-keys": [
								"error",
								{
									order: [
										"name",
										"id",
										{
											keyPattern: ".*",
											order: { natural: true, type: "asc" },
										},
									],
									pathPattern: "(?!$).*",
								},
								{
									order: { natural: true, type: "asc" },
									pathPattern: "(?!$).*",
								},
							],
							"yaml/spaced-comment": "error",
						}
					: {}),

				...overrides,
			},
		},
	];
}
