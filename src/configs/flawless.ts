import { GLOB_DTS, GLOB_MARKDOWN, GLOB_TS, GLOB_TSX } from "../globs";
import type {
	OptionsOverridesTypeAware,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types";
import { getTsConfig, interopDefault } from "../utils";

export async function flawless(
	options: OptionsOverridesTypeAware &
		OptionsTypeScriptParserOptions &
		OptionsTypeScriptWithTypes = {},
): Promise<Array<TypedFlatConfigItem>> {
	const { overridesTypeAware = {}, typeAware = true } = options;

	const eslintPluginFlawless = await interopDefault(import("eslint-plugin-flawless"));

	const tsFilesTypeAware = [GLOB_TS];
	const tsxFilesTypeAware = [GLOB_TSX];
	const ignoresTypeAware = options.ignoresTypeAware ?? [`${GLOB_MARKDOWN}/**`, GLOB_DTS];
	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	return [
		{
			name: "isentinel/flawless/setup",
			plugins: {
				flawless: eslintPluginFlawless,
			},
		},
		...(isTypeAware
			? [
					{
						files: tsFilesTypeAware,
						ignores: ignoresTypeAware,
						name: "isentinel/flawless/ts/rules-type-aware",
						rules: {
							"flawless/naming-convention": [
								"error",
								{
									format: ["strictCamelCase"],
									selector: "default",
								},
								{
									format: null,
									selector: "import",
								},
								{
									format: null,
									modifiers: ["destructured"],
									selector: "variable",
								},
								{
									format: ["strictCamelCase"],
									leadingUnderscore: "allow",
									selector: "variable",
								},
								{
									format: null,
									modifiers: ["destructured"],
									selector: "parameter",
								},
								{
									format: ["strictCamelCase"],
									leadingUnderscore: "allow",
									selector: "parameter",
								},
								{
									format: ["StrictPascalCase"],
									selector: "enumMember",
								},
								{
									// Enforce that all top-level variables are
									// in UPPER_CASE
									format: ["UPPER_CASE"],
									leadingUnderscore: "forbid",
									modifiers: ["global"],
									selector: "variable",
									trailingUnderscore: "forbid",
									types: ["boolean", "number", "string"],
								},
								{
									// Enforce that boolean variables are in
									// PascalCase and are prefixed with an allowed
									// verb like "is", "should",
									filter: {
										match: false,
										regex: "^success$",
									},
									format: ["PascalCase"],
									prefix: ["is", "should", "has", "can", "did", "will"],
									selector: "variable",
									types: ["boolean"],
								},
								{
									// Enforce that global boolean variables are
									// in UPPER_CASE and are prefixed with an
									// allowed verb like "is", "should",
									filter: {
										match: false,
										regex: "^success$",
									},
									format: ["UPPER_CASE"],
									modifiers: ["global"],
									prefix: ["IS_", "SHOULD_", "HAS_", "CAN_", "DID_", "WILL_"],
									selector: "variable",
									types: ["boolean"],
								},
								{
									format: ["strictCamelCase"],
									selector: ["function", "classMethod"],
								},
								{
									format: ["strictCamelCase"],
									selector: ["method"],
								},

								{
									format: ["strictCamelCase"],
									leadingUnderscore: "forbid",
									selector: "classProperty",
								},

								{
									format: ["UPPER_CASE"],
									modifiers: ["static", "readonly"],
									selector: "classProperty",
								},

								{
									// Flexible rule for object literal properties
									format: null,
									selector: "objectLiteralProperty",
								},
								{
									// Type-like entities (classes, interfaces,
									// types, enums)
									format: ["StrictPascalCase"],
									selector: "typeLike",
								},

								{
									format: ["StrictPascalCase"],
									selector: "objectStyleEnum",
								},

								{
									format: ["strictCamelCase", "UPPER_CASE"],
									modifiers: ["global"],
									selector: "variable",
								},
								{
									format: null,
									modifiers: ["destructured", "global"],
									selector: "variable",
								},
							],

							...overridesTypeAware,
						} as TypedFlatConfigItem["rules"],
					},
				]
			: []),
		...(isTypeAware
			? [
					{
						files: tsxFilesTypeAware,
						ignores: ignoresTypeAware,
						name: "isentinel/flawless/tsx/rules-type-aware",
						rules: {
							"flawless/naming-convention": [
								"error",
								{
									format: ["strictCamelCase"],
									selector: "default",
								},
								{
									format: ["PascalCase", "strictCamelCase"],
									selector: ["objectLiteralMethod", "objectLiteralProperty"],
								},

								{
									format: ["strictCamelCase", "StrictPascalCase"],
									selector: "typeProperty",
								},

								{
									format: null,
									selector: "import",
								},

								{
									format: ["strictCamelCase"],
									leadingUnderscore: "allow",
									selector: "variable",
								},

								{
									custom: {
										match: true,
										regex: "React",
									},
									format: ["StrictPascalCase"],
									leadingUnderscore: "allow",
									selector: "variable",
								},

								{
									format: null,
									modifiers: ["destructured"],
									selector: "parameter",
								},
								{
									format: ["strictCamelCase"],
									leadingUnderscore: "allow",
									selector: "parameter",
								},
								{
									format: ["StrictPascalCase"],
									selector: "enumMember",
								},
								{
									// Enforce that all top-level variables are
									// in UPPER_CASE
									format: ["UPPER_CASE"],
									leadingUnderscore: "forbid",
									modifiers: ["global"],
									selector: "variable",
									trailingUnderscore: "forbid",
									types: ["boolean", "number", "string"],
								},
								{
									// Enforce that boolean variables are in
									// PascalCase and are prefixed with an allowed
									// verb like "is", "should",
									filter: {
										match: false,
										regex: "^success$",
									},
									format: ["PascalCase"],
									prefix: ["is", "should", "has", "can", "did", "will"],
									selector: "variable",
									types: ["boolean"],
								},
								{
									// Enforce that global boolean variables are
									// in UPPER_CASE and are prefixed with an
									// allowed verb like "is", "should",
									filter: {
										match: false,
										regex: "^success$",
									},
									format: ["UPPER_CASE"],
									modifiers: ["global"],
									prefix: ["IS_", "SHOULD_", "HAS_", "CAN_", "DID_", "WILL_"],
									selector: "variable",
									types: ["boolean"],
								},
								{
									format: ["strictCamelCase", "StrictPascalCase"],
									selector: "function",
								},

								{
									format: ["strictCamelCase"],
									leadingUnderscore: "forbid",
									selector: "classProperty",
								},

								{
									format: ["UPPER_CASE"],
									modifiers: ["static", "readonly"],
									selector: "classProperty",
								},

								{
									// Flexible rule for object literal properties
									format: null,
									selector: "objectLiteralProperty",
								},

								{
									// Type-like entities (classes, interfaces,
									// types, enums)
									format: ["StrictPascalCase"],
									selector: "typeLike",
								},

								{
									format: ["StrictPascalCase"],
									selector: "objectStyleEnum",
								},

								{
									format: ["strictCamelCase", "UPPER_CASE", "StrictPascalCase"],
									modifiers: ["global"],
									selector: "variable",
								},

								{
									format: null,
									modifiers: ["destructured", "global"],
									selector: "variable",
								},
								{
									format: null,
									modifiers: ["destructured"],
									selector: "variable",
								},
							],

							...overridesTypeAware,
						} as TypedFlatConfigItem["rules"],
					},
				]
			: []),
	];
}
