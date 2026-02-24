import { GLOB_MARKDOWN, GLOB_TS, GLOB_TSX } from "../globs.ts";
import type {
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsOverridesTypeAware,
	OptionsStylistic,
	OptionsTypeScriptErasableOnly,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	Rules,
	TypedFlatConfigItem,
	TypedOxlintConfigItem,
} from "../types.ts";
import {
	createTsParser,
	ensurePackages,
	getTsConfig,
	interopDefault,
	renameRules,
} from "../utils.ts";

export function typescriptRules(options: { stylistic: boolean | object }): Rules {
	const { stylistic } = options;

	return {
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
		"ts/no-unused-private-class-members": "error",
		"ts/no-unused-vars": "off",
		"ts/no-use-before-define": "off",
		"ts/no-useless-constructor": "error",
		"ts/no-wrapper-object-types": "error",
		"ts/prefer-for-of": "error",
		"ts/prefer-function-type": "error",
		"ts/prefer-literal-enum-member": ["error", { allowBitwiseExpressions: true }],
		"ts/triple-slash-reference": "off",
		"ts/unified-signatures": "off",

		...(stylistic !== false
			? {
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
				}
			: {}),
	};
}

export function typescriptTypeAwareRules(): Rules {
	return {
		"ts/await-thenable": "error",
		"ts/consistent-type-assertions": [
			"error",
			{ assertionStyle: "as", objectLiteralTypeAssertions: "allow" },
		],
		"ts/dot-notation": ["error", { allowKeywords: true }],
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
		"ts/no-useless-default-assignment": "error",
		"ts/non-nullable-type-assertion-style": "error",
		"ts/only-throw-error": [
			"error",
			{ allow: [{ name: "Error", from: "package", package: "@rbxts/luau-polyfill" }] },
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
		"ts/strict-void-return": "error",
		"ts/switch-exhaustiveness-check": "error",
		"ts/unbound-method": "error",
		"ts/use-unknown-in-catch-callback-variable": "error",
	};
}

export function oxlintTypescript(options: {
	stylistic: boolean | object;
}): Array<TypedOxlintConfigItem> {
	const allRules = {
		...typescriptRules(options),
		...typescriptTypeAwareRules(),
	};

	// Extension rules that exist as eslint/ in oxlint, not typescript/
	// These are base JS rules that typescript-eslint extends
	const eslintExtensionRules = new Set([
		"ts/default-param-last",
		"ts/no-array-constructor",
		"ts/no-dupe-class-members",
		"ts/no-empty-function",
		"ts/no-redeclare",
		"ts/no-shadow",
		"ts/no-unused-expressions",
		"ts/no-unused-private-class-members",
		"ts/no-unused-vars",
		"ts/no-use-before-define",
		"ts/no-useless-constructor",
		"ts/prefer-destructuring",
	]);

	// TODO(oxlint): not yet implemented (oxc-project/oxc#2180)
	// explicit-member-accessibility, method-signature-style
	const notYetImplemented = new Set([
		"ts/explicit-member-accessibility",
		"ts/method-signature-style",
	]);

	const renamedRules: Rules = {};
	for (const [key, value] of Object.entries(allRules)) {
		if (notYetImplemented.has(key)) {
			continue;
		}

		if (eslintExtensionRules.has(key)) {
			// These exist under eslint/ source in oxlint
			renamedRules[`eslint/${key.slice(3)}`] = value;
		} else if (key.startsWith("ts/")) {
			renamedRules[`typescript/${key.slice(3)}`] = value;
		} else {
			renamedRules[key] = value;
		}
	}

	return [
		{
			name: "isentinel/typescript",
			files: [GLOB_TS, GLOB_TSX],
			plugins: ["eslint", "typescript"],
			rules: renamedRules,
		},
	];
}

export async function typescript(
	options: OptionsComponentExtensions &
		OptionsFiles &
		OptionsOverridesTypeAware &
		OptionsStylistic &
		OptionsTypeScriptErasableOnly &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		erasableOnly = false,
		outOfProjectFiles,
		overrides = {},
		overridesTypeAware = {},
		parserOptions = {},
		parserOptionsNonTypeAware = {},
		parserOptionsTypeAware = {},
		stylistic = true,
		typeAware = true,
	} = options;

	const files = options.files ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	const filesTypeAware = options.filesTypeAware ?? [GLOB_TS, GLOB_TSX];
	const ignoresTypeAware = options.ignoresTypeAware ?? [`${GLOB_MARKDOWN}/**`];
	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	const typeAwareRules: TypedFlatConfigItem["rules"] = {
		"dot-notation": "off",
		"no-implied-eval": "off",
		"no-unsafe-optional-chaining": "error",
		"prefer-promise-reject-errors": "off",
		...typescriptTypeAwareRules(),
	};

	const [parserTs, pluginTs, pluginAntfu] = await Promise.all([
		interopDefault(import("@typescript-eslint/parser")),
		interopDefault(import("@typescript-eslint/eslint-plugin")),
		interopDefault(import("eslint-plugin-antfu")),
	] as const);

	const erasablePlugin = await (async () => {
		if (!erasableOnly) {
			return;
		}

		await ensurePackages(["eslint-plugin-erasable-syntax-only"]);
		return interopDefault(import("eslint-plugin-erasable-syntax-only"));
	})();

	function makeParser(
		usesTypeInformation: boolean,
		parserFiles: Array<Array<string> | string>,
		ignores?: Array<string>,
	): TypedFlatConfigItem {
		return createTsParser({
			componentExtensions,
			configName: "typescript",
			files: parserFiles,
			ignores,
			outOfProjectFiles,
			parser: parserTs,
			parserOptions,
			parserOptionsNonTypeAware,
			parserOptionsTypeAware,
			tsconfigPath,
			typeAware: usesTypeInformation,
		});
	}

	return [
		{
			// Install the plugins without globs, so they can be configured
			// separately.
			name: "isentinel/typescript/setup",
			plugins: {
				antfu: pluginAntfu,
				ts: pluginTs,
			},
		},
		// assign type-aware parser for type-aware files and type-unaware parser
		// for the rest
		...(isTypeAware
			? [makeParser(false, files), makeParser(true, filesTypeAware, ignoresTypeAware)]
			: [makeParser(false, files)]),
		{
			name: "isentinel/typescript/rules",
			files,
			rules: {
				...renameRules(
					pluginTs.configs["eslint-recommended"]?.overrides?.[0]?.rules ?? {},
					{
						"@typescript-eslint": "ts",
					},
				),
				...renameRules(pluginTs.configs["strict"]?.rules ?? {}, {
					"@typescript-eslint": "ts",
				}),

				"no-dupe-class-members": "off",
				"no-empty-function": "off",
				"no-loss-of-precision": "off",
				"no-redeclare": "off",
				"no-restricted-syntax": ["error", "[declare=true]"],
				"no-shadow": "off",
				"no-throw-literal": "off",
				"no-unused-expressions": "off",
				"no-unused-private-class-members": "off",
				"no-use-before-define": "off",
				"no-useless-constructor": "off",
				"prefer-destructuring": "off",

				...typescriptRules({ stylistic }),
				...overrides,
			},
		},
		...(isTypeAware
			? [
					{
						name: "isentinel/typescript/rules-type-aware",
						files: filesTypeAware,
						ignores: ignoresTypeAware,
						rules: {
							...typeAwareRules,
							...overridesTypeAware,
						},
					},
				]
			: []),

		...(erasableOnly
			? [
					{
						name: "isentinel/typescript/erasable-syntax-only",
						plugins: {
							"erasable-syntax-only": erasablePlugin,
						},
						rules: {
							"erasable-syntax-only/enums": "error",
							"erasable-syntax-only/import-aliases": "error",
							"erasable-syntax-only/namespaces": "error",
							"erasable-syntax-only/parameter-properties": "error",
						} as const,
					},
				]
			: []),
	];
}
