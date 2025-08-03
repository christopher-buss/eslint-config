import { GLOB_YAML } from "../globs";
import type {
	OptionsFiles,
	OptionsOverrides,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types";
import { interopDefault } from "../utils";

export async function yaml(
	options: OptionsFiles & OptionsOverrides & OptionsStylistic = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		files = [GLOB_YAML, "**/github-actions-workflow"],
		overrides = {},
		stylistic = true,
	} = options;

	const { indent = 2, quotes = "single" } = typeof stylistic === "boolean" ? {} : stylistic;

	const [pluginYaml, parserYaml] = await Promise.all([
		interopDefault(import("eslint-plugin-yml")),
		interopDefault(import("yaml-eslint-parser")),
	] as const);

	return [
		{
			name: "isentinel/yaml/setup",
			plugins: {
				yaml: pluginYaml,
			},
		},
		{
			files,
			languageOptions: {
				parser: parserYaml,
			},
			name: "isentinel/yaml/rules",
			rules: {
				"isentinel/spaced-comment": "off",

				"yaml/block-mapping": "error",
				"yaml/block-sequence": "error",
				"yaml/file-extension": "error",
				"yaml/no-empty-key": "error",
				"yaml/no-empty-sequence-entry": "error",
				"yaml/no-irregular-whitespace": "error",
				"yaml/plain-scalar": "error",

				...(stylistic
					? {
							"yaml/block-mapping-colon-indicator-newline": "error",
							"yaml/block-mapping-question-indicator-newline": "error",
							"yaml/block-sequence-hyphen-indicator-newline": "error",
							"yaml/flow-mapping-curly-newline": "error",
							"yaml/flow-mapping-curly-spacing": "error",
							"yaml/flow-sequence-bracket-newline": "error",
							"yaml/flow-sequence-bracket-spacing": "error",
							"yaml/indent": [
								"error",
								indent === "tab" ? 2 : indent,
								{
									alignMultilineFlowScalars: true,
								},
							],
							"yaml/key-spacing": "error",
							"yaml/no-tab-indent": "error",
							"yaml/quotes": [
								"error",
								{
									avoidEscape: true,
									prefer: quotes === "backtick" ? "single" : quotes,
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
