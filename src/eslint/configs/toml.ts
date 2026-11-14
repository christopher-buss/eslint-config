import { GLOB_TOML } from "../../globs.ts";
import { maxCommentLengthRules } from "../../rules/flawless.ts";
import type { FlawlessRuleOptions } from "../../rules/flawless.ts";
import { interopDefault, resolveWithDefaults } from "../../utils.ts";
import { lazyPlugin } from "../lazy-plugin.ts";
import type {
	OptionsFiles,
	OptionsOverrides,
	OptionsStylistic,
	TypedFlatConfigItem,
} from "../types.ts";

export async function toml({
	antiSlop = false,
	files = [GLOB_TOML],
	overrides = {},
	stylistic = true,
}: FlawlessRuleOptions & OptionsFiles & OptionsOverrides & OptionsStylistic = {}): Promise<
	Array<TypedFlatConfigItem>
> {
	const defaults = resolveWithDefaults(stylistic, {});
	const { indent = 2 } = defaults === false ? {} : defaults;
	const indentValue = typeof indent === "number" ? indent : 2;

	const eslintPluginFlawless = lazyPlugin("eslint-plugin-flawless");
	const pluginToml = lazyPlugin("eslint-plugin-toml");
	const parserToml = await interopDefault(import("toml-eslint-parser"));

	return [
		{
			name: "isentinel/toml/setup",
			plugins: {
				flawless: eslintPluginFlawless,
				toml: pluginToml,
			},
		},
		{
			name: "isentinel/toml/rules",
			files,
			languageOptions: {
				parser: parserToml,
			},
			rules: {
				"isentinel/spaced-comment": "off",

				"toml/comma-style": "error",
				"toml/keys-order": "error",
				"toml/no-space-dots": "error",
				"toml/no-unreadable-number-separator": "error",
				"toml/precision-of-fractional-seconds": "error",
				"toml/precision-of-integer": "error",
				"toml/tables-order": "error",

				...(stylistic !== false
					? {
							"toml/array-bracket-newline": "error",
							"toml/array-bracket-spacing": "error",
							"toml/array-element-newline": "error",
							"toml/indent": ["error", indentValue],
							"toml/inline-table-curly-spacing": "error",
							"toml/key-spacing": "error",
							"toml/padding-line-between-pairs": "error",
							"toml/padding-line-between-tables": "error",
							"toml/quoted-keys": "error",
							"toml/spaced-comment": "error",
							"toml/table-bracket-spacing": "error",
						}
					: {}),

				...(antiSlop ? maxCommentLengthRules() : {}),

				...overrides,
			},
		},
	];
}
