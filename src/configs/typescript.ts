import { GLOB_MARKDOWN, GLOB_TS, GLOB_TSX } from "../globs";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsIsInEditor,
	OptionsOverrides,
	OptionsStylistic,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types";
import { createTsParser, getTsConfig, interopDefault, renameRules } from "../utils";

export async function typescript(
	options: OptionsComponentExtensions &
		OptionsFiles &
		OptionsIsInEditor &
		OptionsOverrides &
		OptionsStylistic &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		isInEditor = false,
		overrides = {},
		overridesTypeAware = {},
		parserOptions = {},
		stylistic = true,
		typeAware = true,
	} = options;

	const files = options.files ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	const filesTypeAware = options.filesTypeAware ?? [GLOB_TS, GLOB_TSX];
	const ignoresTypeAware = options.ignoresTypeAware ?? [`${GLOB_MARKDOWN}/**.*`];
	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	const typeAwareRules: TypedFlatConfigItem["rules"] = {
		"dot-notation": "off",
		"no-implied-eval": "off",
		"no-unsafe-optional-chaining": "error",
		"ts/await-thenable": "error",
		"ts/consistent-type-assertions": [
			"error",
			{ assertionStyle: "as", objectLiteralTypeAssertions: "allow" },
		],
		"ts/dot-notation": ["error", { allowKeywords: true }],
		"ts/naming-convention": [
			"error",
			{
				custom: {
					match: false,
					regex: "^I[A-Z]",
				},
				format: ["PascalCase"],
				selector: "interface",
			},
		],
		"ts/no-confusing-void-expression": "error",
		"ts/no-duplicate-type-constituents": "error",
		"ts/no-empty-object-type": "error",
		"ts/no-floating-promises": [
			"error",
			{
				ignoreVoid: true,
			},
		],
		"ts/no-for-in-array": "error",
		"ts/no-implied-eval": "error",
		"ts/no-meaningless-void-operator": "error",
		"ts/no-misused-promises": "error",
		"ts/no-mixed-enums": "error",
		"ts/no-redundant-type-constituents": "error",
		"ts/no-unnecessary-boolean-literal-compare": "error",
		"ts/no-unnecessary-condition": ["error", { allowConstantLoopConditions: true }],
		"ts/no-unnecessary-parameter-property-assignment": "error",
		"ts/no-unnecessary-qualifier": "error",
		"ts/no-unnecessary-template-expression": "error",
		"ts/no-unnecessary-type-arguments": "error",
		"ts/no-unnecessary-type-assertion": "error",
		"ts/no-unnecessary-type-constraint": "error",
		"ts/no-unnecessary-type-parameters": "error",
		"ts/no-unsafe-argument": "error",
		"ts/no-unsafe-assignment": "error",
		"ts/no-unsafe-call": "error",
		"ts/no-unsafe-enum-comparison": "error",
		"ts/no-unsafe-member-access": "error",
		"ts/no-unsafe-return": "error",
		"ts/no-unsafe-unary-minus": "error",
		"ts/non-nullable-type-assertion-style": "error",
		"ts/only-throw-error": [
			"error",
			{ allow: [{ from: "package", name: "Error", package: "@rbxts/luau-polyfill" }] },
		],
		"ts/prefer-destructuring": ["error", { array: false, object: true }],
		"ts/prefer-find": "error",
		"ts/prefer-includes": "error",
		"ts/prefer-nullish-coalescing": "error",
		"ts/prefer-optional-chain": "error",
		"ts/prefer-promise-reject-errors": "error",
		"ts/prefer-readonly": "error",
		"ts/prefer-reduce-type-parameter": "error",
		"ts/prefer-return-this-type": "error",
		"ts/promise-function-async": "error",
		"ts/restrict-plus-operands": "error",
		"ts/restrict-template-expressions": "off",
		"ts/return-await": "error",
		"ts/strict-boolean-expressions": "error",
		"ts/switch-exhaustiveness-check": "error",
		"ts/unbound-method": "error",
		"ts/use-unknown-in-catch-callback-variable": "error",
	};

	const [parserTs, pluginTs, pluginDeMorgan, pluginAntfu, pluginMaxParameters] =
		await Promise.all([
			interopDefault(import("@typescript-eslint/parser")),
			interopDefault(import("@typescript-eslint/eslint-plugin")),
			interopDefault(import("eslint-plugin-de-morgan")),
			interopDefault(import("eslint-plugin-antfu")),
			// @ts-expect-error -- No types
			interopDefault(import("eslint-plugin-better-max-params")),
		] as const);

	function makeParser(
		usesTypeInformation: boolean,
		parserFiles: Array<string>,
		ignores?: Array<string>,
	): TypedFlatConfigItem {
		return createTsParser({
			componentExtensions: [GLOB_TS],
			configName: "typescript",
			files: parserFiles,
			ignores,
			parser: parserTs,
			parserOptions,
			tsconfigPath,
			typeAware: usesTypeInformation,
		});
	}

	return [
		{
			// Install the plugins without globs, so they can be configured
			// separately.
			name: "style/typescript/setup",
			plugins: {
				"antfu": pluginAntfu,
				"better-max-params": pluginMaxParameters,
				"de-morgan": pluginDeMorgan,
				"ts": pluginTs,
			},
		},
		// assign type-aware parser for type-aware files and type-unaware parser for the rest
		...(isTypeAware
			? [makeParser(false, files), makeParser(true, filesTypeAware, ignoresTypeAware)]
			: [makeParser(false, files)]),
		{
			files,
			name: "style/typescript/rules",
			rules: {
				...renameRules(pluginTs.configs["eslint-recommended"].overrides?.[0].rules ?? {}, {
					"@typescript-eslint": "ts",
				}),
				...renameRules(pluginTs.configs.strict.rules ?? {}, { "@typescript-eslint": "ts" }),

				"antfu/no-top-level-await": "error",
				"array-callback-return": [
					"error",
					{
						allowImplicit: true,
					},
				],
				"better-max-params/better-max-params": [
					"error",
					{
						func: 4,
					},
				],

				"de-morgan/no-negated-conjunction": "error",
				"de-morgan/no-negated-disjunction": "error",

				"eqeqeq": "error",
				"for-direction": "error",
				"logical-assignment-operators": "error",
				"max-classes-per-file": "error",
				"max-depth": "error",
				"no-async-promise-executor": "error",
				"no-cond-assign": ["error", "always"],
				"no-constant-condition": [
					"error",
					{
						checkLoops: false,
					},
				],
				"no-control-regex": "error",
				"no-dupe-class-members": "off",
				"no-else-return": ["error", { allowElseIf: false }],
				"no-empty": ["error", { allowEmptyCatch: true }],
				"no-empty-character-class": "error",
				"no-empty-function": "off",
				"no-empty-pattern": "error",
				"no-empty-static-block": "error",
				"no-ex-assign": "error",
				"no-extra-boolean-cast": "error",
				"no-irregular-whitespace": "error",
				"no-lonely-if": "error",
				"no-loss-of-precision": "off",
				"no-redeclare": "off",
				"no-regex-spaces": "error",
				"no-return-assign": ["error", "always"],
				"no-self-assign": "error",
				"no-self-compare": "error",
				"no-shadow": "off",
				"no-sparse-arrays": "error",
				"no-template-curly-in-string": "error",
				"no-undef-init": "error",
				"no-unmodified-loop-condition": "error",
				"no-unneeded-ternary": "error",
				"no-unsafe-finally": "error",
				"no-unused-expressions": "off",
				"no-unused-private-class-members": "off",
				"no-unused-vars": "off",
				"no-use-before-define": "off",
				"no-useless-backreference": "error",

				"no-useless-computed-key": "error",
				"no-useless-constructor": "off",
				"no-useless-rename": "error",
				"no-useless-return": "error",
				"prefer-const": [
					isInEditor ? "warn" : "error",
					{
						destructuring: "all",
						ignoreReadBeforeAssign: true,
					},
				],
				"prefer-destructuring": "off",
				"ts/adjacent-overload-signatures": "off",
				"ts/ban-ts-comment": ["error", { "ts-ignore": "allow-with-description" }],
				"ts/default-param-last": "error",
				"ts/explicit-function-return-type": [
					"error",
					{
						allowExpressions: true,
					},
				],
				"ts/explicit-member-accessibility": [
					"error",
					{
						overrides: {
							constructors: "no-public",
						},
					},
				],
				"ts/method-signature-style": "off",
				"ts/no-array-constructor": "off",
				"ts/no-confusing-non-null-assertion": "error",
				"ts/no-dupe-class-members": "off",
				"ts/no-dynamic-delete": "off",
				"ts/no-empty-function": "error",
				"ts/no-empty-object-type": ["error", { allowInterfaces: "always" }],
				"ts/no-explicit-any": "off",
				"ts/no-extraneous-class": "error",
				"ts/no-for-in-array": "off",
				"ts/no-import-type-side-effects": "error",
				"ts/no-inferrable-types": "error",
				"ts/no-invalid-void-type": "off",
				"ts/no-namespace": "off",
				"ts/no-non-null-assertion": "error",
				"ts/no-redeclare": "off",
				"ts/no-require-imports": "error",
				"ts/no-shadow": "error",
				"ts/no-unused-expressions": "error",
				"ts/no-unused-vars": [
					"error",
					{
						argsIgnorePattern: "^_",
						caughtErrorsIgnorePattern: "^_",
						reportUsedIgnorePattern: true,
						varsIgnorePattern: "^_",
					},
				],
				"ts/no-use-before-define": "off",
				"ts/no-useless-constructor": "error",
				"ts/no-wrapper-object-types": "error",
				"ts/prefer-for-of": "error",
				"ts/prefer-function-type": "error",
				"ts/prefer-literal-enum-member": ["error", { allowBitwiseExpressions: true }],
				"ts/triple-slash-reference": "off",

				"ts/unified-signatures": "off",

				...(stylistic
					? {
							"camelcase": [
								"error",
								{
									ignoreImports: true,
								},
							],
							"id-length": [
								"error",
								{
									exceptions: ["_", "x", "y", "z", "a", "b", "e"],
									max: 30,
									min: 2,
									properties: "never",
								},
							],
							"max-lines": [
								"warn",
								{ max: 300, skipBlankLines: true, skipComments: true },
							],
							"max-lines-per-function": [
								"warn",
								{ max: 30, skipBlankLines: true, skipComments: true },
							],
							"no-lone-blocks": "error",
							"no-multi-str": "error",
							"object-shorthand": "error",
							"one-var": ["error", { initialized: "never" }],
							"ts/array-type": [
								"error",
								{
									default: "generic",
									readonly: "generic",
								},
							],
							"ts/consistent-generic-constructors": ["error", "constructor"],
							"ts/consistent-indexed-object-style": ["error", "record"],
							"ts/consistent-type-definitions": ["error", "interface"],
							"ts/consistent-type-imports": [
								"error",
								{ disallowTypeAnnotations: false, prefer: "type-imports" },
							],
							"yoda": ["error", "never"],
						}
					: {}),
				...overrides,
			},
		},
		...(isTypeAware
			? [
					{
						files: filesTypeAware,
						ignores: ignoresTypeAware,
						name: "style/typescript/rules-type-aware",
						rules: {
							...typeAwareRules,
							...overridesTypeAware,
						},
					},
				]
			: []),
	];
}
