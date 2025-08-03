import { fixupPluginRules } from "@eslint/compat";

import { GLOB_MARKDOWN, GLOB_SRC, GLOB_TS, GLOB_TSX } from "../globs";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	ReactConfig,
	TypedFlatConfigItem,
} from "../types";
import { createTsParser, ensurePackages, getTsConfig, interopDefault } from "../utils";

export async function react(
	options: OptionsComponentExtensions &
		OptionsFiles &
		OptionsStylistic &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes &
		ReactConfig = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		additionalComponents,
		additionalHooks,
		componentExts: componentExtensions = [],
		filenameCase = "kebabCase",
		files = [GLOB_SRC],
		filesTypeAware = [GLOB_TS, GLOB_TSX],
		ignoresTypeAware = [`${GLOB_MARKDOWN}/**`],
		importSource,
		jsxPragma,
		overrides = {},
		parserOptions,
		skipImportCheck,
		stylistic = true,
		typeAware = true,
	} = options;

	await ensurePackages(["@eslint-react/eslint-plugin", "eslint-plugin-react-roblox-hooks"]);

	const [pluginReact, pluginReactHooks, pluginStylistic, parserTs, pluginTs, pluginUnicorn] =
		await Promise.all([
			interopDefault(import("@eslint-react/eslint-plugin")),
			interopDefault(import("eslint-plugin-react-roblox-hooks")),
			interopDefault(import("@stylistic/eslint-plugin")),
			interopDefault(import("@typescript-eslint/parser")),
			interopDefault(import("@typescript-eslint/eslint-plugin")),
			interopDefault(import("eslint-plugin-unicorn")),
		] as const);

	const plugins = pluginReact.configs.all.plugins;

	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	const reactSettings = {
		additionalComponents,
		additionalHooks,
		importSource: importSource ?? "@rbxts",
		jsxPragma: jsxPragma ?? "React",
		skipImportCheck,
		version: "17.0.2",
	};

	return [
		{
			name: "isentinel/react/setup",
			plugins: {
				"react": plugins["@eslint-react"],
				"react-hooks-extra": plugins["@eslint-react/hooks-extra"],
				"react-hooks-roblox": fixupPluginRules(pluginReactHooks),
				"react-naming-convention": plugins["@eslint-react/naming-convention"],
				"style": pluginStylistic,
				"ts": pluginTs,
				"unicorn": pluginUnicorn,
			},
		},
		{
			...createTsParser({
				componentExtensions,
				configName: "roblox",
				files,
				parser: parserTs,
				parserOptions,
				tsconfigPath,
				typeAware: isTypeAware,
			}),
			name: "isentinel/react/rules",
			rules: {
				// recommended rules from @eslint-react/hooks-extra
				// react-lua does not seem to fully support the patterns that this rule enforces.
				"react-hooks-extra/no-direct-set-state-in-use-effect": "off",
				"react-hooks-extra/no-direct-set-state-in-use-layout-effect": "off",
				"react-hooks-extra/no-unnecessary-use-callback": "error",
				"react-hooks-extra/no-unnecessary-use-memo": "error",
				"react-hooks-extra/no-unnecessary-use-prefix": "error",
				"react-hooks-extra/prefer-use-state-lazy-initialization": "error",
				// recommended rules react-hooks roblox
				"react-hooks-roblox/exhaustive-deps": "warn",
				"react-hooks-roblox/rules-of-hooks": "error",
				// recommended rules from @eslint-react/naming-convention
				"react-naming-convention/context-name": "error",
				"react-naming-convention/filename-extension": ["warn", "as-needed"],
				"react-naming-convention/use-state": "error",
				// recommended rules from @eslint-react
				"react/ensure-forward-ref-using-ref": "warn",
				"react/jsx-no-duplicate-props": "off",
				"react/jsx-no-undef": "off",
				"react/jsx-uses-react": "off",
				"react/jsx-uses-vars": "off",
				"react/no-access-state-in-setstate": "error",
				"react/no-array-index-key": "warn",
				"react/no-children-count": "warn",
				"react/no-children-for-each": "warn",
				"react/no-children-map": "warn",
				"react/no-children-only": "warn",
				"react/no-children-prop": "warn",
				"react/no-children-to-array": "warn",
				"react/no-class-component": "error",
				"react/no-clone-element": "warn",
				"react/no-comment-textnodes": "warn",
				"react/no-complex-conditional-rendering": "error",
				"react/no-component-will-mount": "off",
				"react/no-component-will-receive-props": "off",
				"react/no-component-will-update": "off",
				"react/no-create-ref": "error",
				"react/no-default-props": "off",
				"react/no-direct-mutation-state": "error",
				"react/no-duplicate-key": "error",
				"react/no-forward-ref": "off",
				"react/no-implicit-key": "error",
				"react/no-missing-component-display-name": "off",
				"react/no-missing-context-display-name": "off",
				"react/no-missing-key": "error",
				"react/no-misused-capture-owner-stack": "off",
				"react/no-nested-component-definitions": "warn",
				"react/no-nested-lazy-component-declarations": "warn",
				"react/no-prop-types": "off",
				"react/no-redundant-should-component-update": "error",
				"react/no-set-state-in-component-did-mount": "warn",
				"react/no-set-state-in-component-did-update": "warn",
				"react/no-set-state-in-component-will-update": "warn",
				"react/no-string-refs": "off",
				"react/no-unsafe-component-will-mount": "off",
				"react/no-unsafe-component-will-receive-props": "off",
				"react/no-unsafe-component-will-update": "off",
				"react/no-unstable-context-value": "error",
				"react/no-unstable-default-props": "off",
				"react/no-unused-class-component-members": "off",
				"react/no-unused-state": "warn",
				"react/no-use-context": "off",
				"react/no-useless-forward-ref": "error",

				...(stylistic
					? {
							"one-var": "off",
							"react/avoid-shorthand-boolean": "warn",
							"react/avoid-shorthand-fragment": "off",
							"react/no-useless-fragment": "warn",
							"react/prefer-destructuring-assignment": "warn",
							"react/prefer-react-namespace-import": "warn",
							"react/prefer-shorthand-boolean": "off",
							"react/prefer-shorthand-fragment": "warn",
							"style/jsx-curly-brace-presence": [
								"error",
								{
									children: "never",
									propElementValues: "always",
									props: "never",
								},
							],
							"style/jsx-newline": "error",
							"style/jsx-self-closing-comp": "error",
							"style/jsx-sort-props": [
								"error",
								{
									callbacksLast: true,
									ignoreCase: true,
									reservedFirst: true,
									shorthandFirst: true,
								},
							],
						}
					: {}),

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
						files: filesTypeAware,
						ignores: ignoresTypeAware,
						name: "isentinel/react/type-aware-rules",
						rules: {
							"react/no-leaked-conditional-rendering": "warn",
							"react/prefer-read-only-props": "error",
						} satisfies TypedFlatConfigItem["rules"],
					},
				]
			: []),
		{
			files: [GLOB_TSX],
			rules: {
				"max-lines-per-function": "off",
				"unicorn/filename-case": [
					"error",
					{
						case: filenameCase,
						ignore: ["^[A-Z0-9]+\.md$"],
						multipleFileExtensions: true,
					},
				],
			},
		},
	];
}
