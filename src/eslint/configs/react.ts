import type { ESLintReactSettings } from "@eslint-react/shared";

import { GLOB_JSX, GLOB_MARKDOWN, GLOB_TSX } from "../../globs.ts";
import { reactRules } from "../../rules/react.ts";
import { ensurePackages, getTsConfig, interopDefault } from "../../utils.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	ReactConfig,
	TypedFlatConfigItem,
} from "../types.ts";

export async function react(
	options: OptionsComponentExtensions &
		OptionsFiles &
		OptionsStylistic &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes &
		ReactConfig = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		filenameCase = "kebabCase",
		files = [GLOB_JSX, GLOB_TSX],
		filesTypeAware = [GLOB_TSX],
		ignoresTypeAware = [`${GLOB_MARKDOWN}/**`],
		importSource,
		overrides = {},
		overridesTypeAware,
		reactCompiler = true,
		stylistic = true,
		typeAware = true,
	} = options;

	await ensurePackages(["eslint-plugin-react-x", "eslint-plugin-react-jsx"]);

	if (stylistic !== false) {
		await ensurePackages(["eslint-plugin-react-naming-convention"]);
	}

	const [
		pluginReactCore,
		pluginReactJsx,
		pluginFlawless,
		pluginStylistic,
		pluginTs,
		pluginUnicorn,
		pluginUnusedImports,
		pluginCeaseNonsense,
	] = await Promise.all([
		interopDefault(import("eslint-plugin-react-x")),
		interopDefault(import("eslint-plugin-react-jsx")),
		interopDefault(import("eslint-plugin-flawless")),
		interopDefault(import("@stylistic/eslint-plugin")),
		interopDefault(import("@typescript-eslint/eslint-plugin")),
		interopDefault(import("eslint-plugin-unicorn")),
		interopDefault(import("eslint-plugin-unused-imports")),
		interopDefault(import("@pobammer-ts/eslint-cease-nonsense-rules")),
	] as const);

	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	const reactSettings = {
		importSource: importSource ?? "@rbxts",
		version: "17.0.2",
	} satisfies ESLintReactSettings;

	const typeAwareRules: TypedFlatConfigItem["rules"] = {
		"react/no-implicit-children": "error",
		"react/no-implicit-key": "error",
		"react/no-implicit-ref": "error",
		"react/no-leaked-conditional-rendering": "warn",
		"react/no-unused-props": "error",
	};

	return [
		{
			name: "isentinel/react/setup",
			plugins: {
				"cease-nonsense": pluginCeaseNonsense,
				"flawless": pluginFlawless,
				"react": pluginReactCore,
				"react-jsx": pluginReactJsx,
				"style": pluginStylistic,
				"ts": pluginTs,
				"unicorn": pluginUnicorn,
				"unused-imports": pluginUnusedImports,
			},
		},
		...(stylistic !== false
			? [
					{
						name: "isentinel/react/setup/naming",
						plugins: {
							"react-naming-convention": await interopDefault(
								import("eslint-plugin-react-naming-convention"),
							),
						},
					},
				]
			: []),
		{
			name: "isentinel/react/rules",
			files,
			languageOptions: {
				parserOptions: {
					ecmaFeatures: {
						jsx: true,
					},
				},
				sourceType: "module",
			},
			rules: {
				...reactRules({ filenameCase, reactCompiler, stylistic }),

				// overrides
				...overrides,
			},
			settings: {
				"react-x": reactSettings,
			},
		},
		...(isTypeAware
			? [
					{
						name: "isentinel/react/type-aware-rules",
						files: filesTypeAware,
						ignores: ignoresTypeAware,
						rules: {
							...typeAwareRules,
							...overridesTypeAware,
						},
					},
				]
			: []),
	];
}
