import { GLOB_SRC } from "../globs.ts";
import type {
	OptionsProjectType,
	OptionsStylistic,
	Rules,
	TypedFlatConfigItem,
	TypedOxlintConfigItem,
} from "../types.ts";
import { interopDefault } from "../utils.ts";

export function importRules(options: OptionsProjectType & OptionsStylistic = {}): Rules {
	const { stylistic } = options;

	return {
		"antfu/import-dedupe": "error",
		"antfu/no-import-dist": "error",
		"antfu/no-import-node-modules-by-path": "error",

		"import/first": "error",
		"import/no-duplicates": "error",
		"import/no-mutable-exports": "error",
		"import/no-named-default": "error",

		...(stylistic !== false
			? {
					"import/newline-after-import": ["error", { considerComments: true, count: 1 }],
				}
			: {}),
	};
}

export function oxlintImports(
	options: OptionsProjectType & OptionsStylistic = {},
): Array<TypedOxlintConfigItem> {
	const allRules = importRules(options);

	// TODO(oxlint): not yet implemented (oxc-project/oxc#493)
	// import/newline-after-import
	const omitRules = new Set(["import/newline-after-import"]);

	const filteredRules: Rules = {};
	for (const [key, value] of Object.entries(allRules)) {
		if (!omitRules.has(key)) {
			filteredRules[key] = value;
		}
	}

	return [
		{
			name: "isentinel/imports/rules",
			files: [GLOB_SRC],
			jsPlugins: [{ name: "antfu", specifier: "eslint-plugin-antfu" }],
			plugins: ["import"],
			rules: filteredRules,
		},
	];
}

export async function imports(
	options: OptionsProjectType & OptionsStylistic = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { stylistic = true, type = "game" } = options;

	const [pluginImport, pluginAntfu] = await Promise.all([
		interopDefault(import("eslint-plugin-import-lite")),
		interopDefault(import("eslint-plugin-antfu")),
	]);

	return [
		{
			name: "isentinel/imports/rules",
			plugins: {
				antfu: pluginAntfu,
				import: pluginImport,
			},
			rules: importRules({ stylistic }),
		},
		...(type === "game"
			? [
					{
						name: "isentinel/imports/game",
						files: [`src/${GLOB_SRC}`],
						rules: {
							"no-restricted-syntax": [
								"error",
								{
									message: "Prefer named exports",
									selector: "ExportDefaultDeclaration",
								},
							],
						} satisfies TypedFlatConfigItem["rules"],
					},
				]
			: []),
	];
}
