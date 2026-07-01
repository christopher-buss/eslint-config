import type { ESLintReactSettings } from "@eslint-react/shared";

import { GLOB_JSX, GLOB_MARKDOWN, GLOB_TSX } from "../globs.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	ReactConfig,
	TypedFlatConfigItem,
} from "../types.ts";
import { ensurePackages, getTsConfig, interopDefault } from "../utils.ts";

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

	await ensurePackages([
		"eslint-plugin-react-x",
		"eslint-plugin-react-jsx",
		"eslint-plugin-react-hooks",
	]);

	if (stylistic !== false) {
		await ensurePackages(["eslint-plugin-react-naming-convention"]);
	}

	const [
		pluginReactCore,
		pluginReactJsx,
		reactHooks,
		pluginFlawless,
		pluginStylistic,
		pluginTs,
		pluginUnicorn,
		pluginUnusedImports,
		pluginCeaseNonsense,
	] = await Promise.all([
		interopDefault(import("eslint-plugin-react-x")),
		interopDefault(import("eslint-plugin-react-jsx")),
		interopDefault(import("eslint-plugin-react-hooks")),
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
				"react-hooks": reactHooks,
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
				"cease-nonsense/react-hooks-strict-return": "error",

				"max-lines-per-function": "off",

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
						}
					: {}),

				// recommended rules from eslint-plugin-react-jsx
				"react-jsx/no-children-prop": "warn",
				"react-jsx/no-comment-textnodes": "warn",
				"react-jsx/no-leaked-dollar": "warn",

				// recommended rules from @eslint-react
				"react/no-access-state-in-setstate": "error",
				"react/no-array-index-key": "warn",
				"react/no-children-count": "warn",
				"react/no-children-for-each": "warn",
				"react/no-children-map": "warn",
				"react/no-children-only": "warn",
				"react/no-children-to-array": "warn",
				"react/no-class-component": "error",
				"react/no-clone-element": "warn",
				"react/no-component-will-mount": "off",
				"react/no-component-will-receive-props": "off",
				"react/no-component-will-update": "off",
				"react/no-create-ref": "error",
				"react/no-direct-mutation-state": "error",
				"react/no-duplicate-key": "error",
				"react/no-forward-ref": "off",
				"react/no-missing-component-display-name": "error",
				"react/no-missing-context-display-name": "error",
				"react/no-missing-key": "error",
				"react/no-misused-capture-owner-stack": "off",
				"react/no-nested-component-definitions": "warn",
				"react/no-nested-lazy-component-declarations": "warn",
				"react/no-set-state-in-component-did-mount": "warn",
				"react/no-set-state-in-component-did-update": "warn",
				"react/no-set-state-in-component-will-update": "warn",
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
				"react/use-state": [
					"error",
					{ enforceAssignment: false, enforceSetterName: false },
				],

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
							"flawless/jsx-shorthand-boolean": "warn",
							"flawless/jsx-shorthand-fragment": "warn",
							"one-var": "off",
							"react-jsx/no-useless-fragment": "warn",
							// recommended rules from
							// @eslint-react/naming-convention
							"react-naming-convention/context-name": "error",
							"react-naming-convention/ref-name": "error",
							"react/use-state": "error",
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
