import type { OptionsProjectType, TypedFlatConfigItem } from "../types";
import { interopDefault } from "../utils";

export async function packageJson(
	options: OptionsProjectType & { roblox?: boolean } = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { roblox = true, type = "game" } = options;

	const [jsoncEslintParser, pluginPackageJson] = await Promise.all([
		interopDefault(import("jsonc-eslint-parser")),
		interopDefault(import("eslint-plugin-package-json")),
	]);

	return [
		{
			name: "isentinel/package-json/setup",
			plugins: {
				"package-json": pluginPackageJson,
			},
		},
		{
			files: ["**/package.json"],
			languageOptions: {
				parser: jsoncEslintParser,
			},
			name: "isentinel/package-json",
			rules: {
				"package-json/no-empty-fields": "error",
				"package-json/no-redundant-files": "error",
				"package-json/order-properties": "error",
				"package-json/repository-shorthand": "error",
				"package-json/require-type": "error",
				"package-json/sort-collections": "error",
				"package-json/unique-dependencies": "error",
				"package-json/valid-author": "error",
				"package-json/valid-bin": "error",
				"package-json/valid-bundleDependencies": "error",
				"package-json/valid-config": "error",
				"package-json/valid-cpu": "error",
				"package-json/valid-directories": "error",
				"package-json/valid-exports": "error",
				"package-json/valid-license": "error",
				"package-json/valid-name": "error",
				"package-json/valid-package-definition": "error",
				"package-json/valid-repository-directory": "error",
				"package-json/valid-scripts": "error",
				"package-json/valid-type": "error",
				"package-json/valid-version": "error",

				...(type === "package"
					? {
							"package-json/require-author": "error",
							"package-json/require-description": "error",
							"package-json/require-files": "error",
							"package-json/require-keywords": "error",
							"package-json/require-name": "error",
							"package-json/require-types": "error",
							"package-json/require-version": "error",
						}
					: {}),

				...(type === "package" && !roblox
					? {
							"package-json/require-engines": "error",
						}
					: {}),
			},
		},
	];
}
