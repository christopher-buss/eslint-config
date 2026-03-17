import type { OptionsFilesTypeAware, ReactConfig } from "../../eslint/types.ts";
import { GLOB_JSX, GLOB_MARKDOWN, GLOB_TSX } from "../../globs.ts";
import type {
	JsPluginRules,
	OptionsComponentExtensions,
	OptionsStylistic,
	OxlintRules,
	TypedOxlintConfigItem,
} from "../types.ts";

export function oxlintReact(
	options: OptionsComponentExtensions &
		OptionsFilesTypeAware &
		OptionsStylistic &
		ReactConfig & { typeAware?: boolean } = {},
): Array<TypedOxlintConfigItem> {
	const {
		filenameCase = "kebabCase",
		files = [GLOB_JSX, GLOB_TSX],
		filesTypeAware = [GLOB_TSX],
		// TODO(oxlint): overrides don't support ignores
		ignoresTypeAware: _ignoresTypeAware = [`${GLOB_MARKDOWN}/**`],
		importSource,
		overrides = {},
		overridesTypeAware,
		reactCompiler = true,
		stylistic = true,
		typeAware = true,
	} = options;

	const flatFiles = files.flat();

	// Native oxlint react rules (from eslint-plugin-react-hooks)
	const nativeRules = {
		"react/exhaustive-deps": "error",
		"react/rules-of-hooks": "error",
	} as const satisfies OxlintRules;

	// eslint-plugin-react-x (@eslint-react ecosystem) — aliased to react-x
	// because "react" is a reserved native oxlint plugin name
	const reactXRules = {
		"react-x/jsx-dollar": "warn",
		"react-x/jsx-no-comment-textnodes": "warn",
		"react-x/jsx-no-duplicate-props": "off",
		"react-x/jsx-no-iife": "off",
		"react-x/jsx-no-undef": "off",
		"react-x/jsx-uses-react": "off",
		"react-x/jsx-uses-vars": "off",
		"react-x/no-access-state-in-setstate": "error",
		"react-x/no-array-index-key": "warn",
		"react-x/no-children-count": "warn",
		"react-x/no-children-for-each": "warn",
		"react-x/no-children-map": "warn",
		"react-x/no-children-only": "warn",
		"react-x/no-children-prop": "warn",
		"react-x/no-children-to-array": "warn",
		"react-x/no-class-component": "error",
		"react-x/no-clone-element": "warn",
		"react-x/no-component-will-mount": "off",
		"react-x/no-component-will-receive-props": "off",
		"react-x/no-component-will-update": "off",
		"react-x/no-create-ref": "error",
		"react-x/no-direct-mutation-state": "error",
		"react-x/no-duplicate-key": "error",
		"react-x/no-forward-ref": "off",
		"react-x/no-missing-component-display-name": "error",
		"react-x/no-missing-context-display-name": "error",
		"react-x/no-missing-key": "error",
		"react-x/no-misused-capture-owner-stack": "off",
		"react-x/no-nested-component-definitions": "warn",
		"react-x/no-nested-lazy-component-declarations": "warn",
		"react-x/no-redundant-should-component-update": "error",
		"react-x/no-set-state-in-component-did-mount": "warn",
		"react-x/no-set-state-in-component-did-update": "warn",
		"react-x/no-set-state-in-component-will-update": "warn",
		"react-x/no-unnecessary-key": "off",
		"react-x/no-unnecessary-use-callback": "error",
		"react-x/no-unnecessary-use-memo": "error",
		"react-x/no-unnecessary-use-prefix": "error",
		"react-x/no-unsafe-component-will-mount": "off",
		"react-x/no-unsafe-component-will-receive-props": "off",
		"react-x/no-unsafe-component-will-update": "off",
		"react-x/no-unstable-context-value": "error",
		"react-x/no-unstable-default-props": [
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
		"react-x/no-unused-class-component-members": "off",
		"react-x/no-unused-state": "error",
		"react-x/no-use-context": "off",
		"react-x/no-useless-forward-ref": "error",
		"react-x/prefer-use-state-lazy-initialization": "error",

		...(stylistic !== false
			? {
					"one-var": "off",
					"react-naming-convention/context-name": "error",
					"react-naming-convention/ref-name": "error",
					"react-naming-convention/use-state": "error",
					"react-x/jsx-shorthand-boolean": ["warn", -1],
					"react-x/jsx-shorthand-fragment": "warn",
					"react-x/no-useless-fragment": "warn",
					"react-x/prefer-destructuring-assignment": "warn",
					"react-x/prefer-namespace-import": "off",
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
	} satisfies JsPluginRules;

	// react-hooks compiler rules
	const reactHooksCompilerRules = reactCompiler
		? ({
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
			} satisfies JsPluginRules)
		: {};

	const typeAwareRules = {
		"react-x/no-implicit-key": "error",
		"react-x/no-leaked-conditional-rendering": "warn",
		"react-x/no-unused-props": "error",
		"react-x/prefer-read-only-props": "error",
	} satisfies JsPluginRules;

	const configs: Array<TypedOxlintConfigItem> = [
		{
			name: "isentinel/oxlint/react",
			files: flatFiles,
			plugins: ["react", "unicorn"],
			rules: {
				...nativeRules,
				"unicorn/filename-case": [
					"error",
					{
						case: filenameCase,
						ignore: ["^[A-Z0-9]+\\.md$"],
						multipleFileExtensions: true,
					},
				],
			} satisfies OxlintRules,
		},
		{
			name: "isentinel/oxlint/react/js-plugin",
			files: flatFiles,
			jsPlugins: [
				{ name: "react-x", specifier: "eslint-plugin-react-x" },
				{ name: "react-hooks", specifier: "eslint-plugin-react-hooks" },
				{ name: "react-hooks-extra", specifier: "eslint-plugin-react-hooks-extra" },
				{ name: "unicorn-js", specifier: "eslint-plugin-unicorn" },
				...(stylistic !== false
					? [
							{
								name: "react-naming-convention",
								specifier: "eslint-plugin-react-naming-convention",
							},
							{ name: "style", specifier: "@stylistic/eslint-plugin" },
						]
					: []),
			],
			rules: {
				"max-lines-per-function": "off",
				"react-hooks-extra/no-direct-set-state-in-use-effect": "off",
				...reactXRules,
				...reactHooksCompilerRules,
				...overrides,
			},
			settings: {
				"react-x": {
					importSource: importSource ?? "@rbxts",
					version: "17.0.2",
				},
			},
		},
	];

	if (typeAware) {
		// TODO(oxlint): overrides don't support `ignores`, so
		// ignoresTypeAware is not applied here
		configs.push({
			name: "isentinel/oxlint/react/type-aware",
			files: filesTypeAware.flat(),
			jsPlugins: [{ name: "react-x", specifier: "eslint-plugin-react-x" }],
			rules: {
				...typeAwareRules,
				...overridesTypeAware,
			},
		});
	}

	return configs;
}
