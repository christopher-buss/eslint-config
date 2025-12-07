import type { ESLintReactSettings } from "@eslint-react/shared";

import { GLOB_JSX, GLOB_MARKDOWN, GLOB_TSX } from "../globs";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	ReactConfig,
	TypedFlatConfigItem,
} from "../types";
import { ensurePackages, getTsConfig, interopDefault } from "../utils";

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

	await ensurePackages(["eslint-plugin-react-x", "eslint-plugin-react-hooks"]);

	if (stylistic !== false) {
		await ensurePackages(["eslint-plugin-react-naming-convention"]);
	}

	const [
		pluginReactCore,
		reactHooks,
		pluginStylistic,
		pluginTs,
		pluginUnicorn,
		pluginUnusedImports,
	] = await Promise.all([
		interopDefault(import("eslint-plugin-react-x")),
		interopDefault(import("eslint-plugin-react-hooks")),
		interopDefault(import("@stylistic/eslint-plugin")),
		interopDefault(import("@typescript-eslint/eslint-plugin")),
		interopDefault(import("eslint-plugin-unicorn")),
		interopDefault(import("eslint-plugin-unused-imports")),
	] as const);

	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	const reactSettings = {
		importSource: importSource ?? "@rbxts",
		version: "17.0.2",
	} satisfies ESLintReactSettings;

	const typeAwareRules: TypedFlatConfigItem["rules"] = {
		"react/no-leaked-conditional-rendering": "warn",
		"react/no-unused-props": "error",
		"react/prefer-read-only-props": "error",
	};

	return [
		{
			name: "isentinel/react/setup",
			plugins: {
				"react": pluginReactCore,
				"react-hooks": reactHooks,

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
				"max-lines-per-function": "off",
				// recommended rules from @eslint-react/hooks-extra
				// react-lua does not seem to fully support the patterns that
				// this rule enforces.
				"react-hooks-extra/no-direct-set-state-in-use-effect": "off",

				// recommended rules react-hooks
				"react-hooks/exhaustive-deps": "error",
				"react-hooks/rules-of-hooks": "error",
				...(reactCompiler
					? {
							"react-hooks/component-hook-factories": "error",
							"react-hooks/config": "off",
							"react-hooks/error-boundaries": "error",
							"react-hooks/gating": "off",
							"react-hooks/globals": "error",
							"react-hooks/immutability": "error",
							"react-hooks/incompatible-library": "off",
							"react-hooks/preserve-manual-memoization": "off",
							"react-hooks/purity": "off",
							"react-hooks/refs": "error",
							"react-hooks/set-state-in-effect": "error",
							"react-hooks/set-state-in-render": "error",
							"react-hooks/static-components": "error",
							"react-hooks/unsupported-syntax": "off",
							"react-hooks/use-memo": "error",
							"react-x/compiler-optimized-helpers": "error",
						}
					: {}),

				// recommended rules from @eslint-react
				"react/jsx-dollar": "warn",
				"react/jsx-no-comment-textnodes": "warn",
				"react/jsx-no-duplicate-props": "off",
				// Currently experimental: https://eslint-react.xyz/docs/rules/jsx-no-iife
				"react/jsx-no-iife": "off",
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
				"react/no-component-will-mount": "off",
				"react/no-component-will-receive-props": "off",
				"react/no-component-will-update": "off",
				"react/no-create-ref": "error",
				// Not supported in React Lua
				"react/no-default-props": "off",
				"react/no-direct-mutation-state": "error",
				"react/no-duplicate-key": "error",
				"react/no-forward-ref": "off",
				"react/no-implicit-key": "error",
				"react/no-missing-component-display-name": "error",
				"react/no-missing-context-display-name": "error",
				"react/no-missing-key": "error",
				"react/no-misused-capture-owner-stack": "off",
				"react/no-nested-component-definitions": "warn",
				"react/no-nested-lazy-component-declarations": "warn",
				// Not supported in React Lua
				"react/no-prop-types": "off",
				"react/no-redundant-should-component-update": "error",
				"react/no-set-state-in-component-did-mount": "warn",
				"react/no-set-state-in-component-did-update": "warn",
				"react/no-set-state-in-component-will-update": "warn",
				"react/no-string-refs": "off",
				// Not applicable in React Lua
				"react/no-unnecessary-key": "off",
				"react/no-unnecessary-use-callback": "error",
				"react/no-unnecessary-use-memo": "error",
				"react/no-unnecessary-use-prefix": "error",
				"react/no-unsafe-component-will-mount": "off",
				"react/no-unsafe-component-will-receive-props": "off",
				"react/no-unsafe-component-will-update": "off",
				"react/no-unstable-context-value": "error",
				"react/no-unstable-default-props": [
					"error",
					{
						safeDefaultProps: [
							"Axes",
							"BrickColor",
							"CatalogSearchParams",
							"CFrame",
							"Color3",
							"ColorSequence",
							"CFrame",
							"Content",
							"DateTime",
							"DockWidgetPluginGuiInfo",
							"Enum",
							"Faces",
							"FloatCurveKey",
							"Font",
							"NumberRange",
							"NumberSequence",
							"NumberSequenceKeypoint",
							"OverlapParams",
							"Path2DControlPoint",
							"PathWaypoint",
							"PhysicalProperties",
							"Ray",
							"RaycastParams",
							"Rect",
							"Region3",
							"Region3int16",
							"RotationCurveKey",
							"SecurityCapabilities",
							"TweenInfo",
							"UDim",
							"UDim2",
							"ValueCurveKey",
							"Vector2",
							"Vector3",
							"Vector3int16",
						],
					},
				],
				"react/no-unused-class-component-members": "off",
				"react/no-unused-state": "error",
				"react/no-use-context": "off",
				"react/no-useless-forward-ref": "error",
				"react/prefer-use-state-lazy-initialization": "error",

				"unicorn/filename-case": [
					"error",
					{
						case: filenameCase,
						ignore: ["^[A-Z0-9]+\.md$"],
						multipleFileExtensions: true,
					},
				],

				...(stylistic !== false
					? {
							"one-var": "off",
							// recommended rules from
							// @eslint-react/naming-convention
							"react-naming-convention/context-name": "error",
							"react-naming-convention/filename-extension": "off",
							"react-naming-convention/use-state": "error",
							// Never use shorthand syntax for boolean attributes.
							"react/jsx-shorthand-boolean": ["warn", -1],
							"react/jsx-shorthand-fragment": "warn",
							"react/no-useless-fragment": "warn",
							"react/prefer-destructuring-assignment": "warn",
							"react/prefer-namespace-import": "off",
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
