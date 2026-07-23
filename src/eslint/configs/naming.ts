import { GLOB_DTS, GLOB_MARKDOWN, GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { getTsConfig, interopDefault } from "../../utils.ts";
import type {
	NamingConfig,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types.ts";

const RBXTS_REACT = "@rbxts/react";

export async function naming(
	options: NamingConfig & OptionsTypeScriptParserOptions & OptionsTypeScriptWithTypes = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		overridesTypeAware = {},
		roblox: isRoblox = true,
		selectors = [],
		selectorsTsx = [],
		typeAware = true,
	} = options;

	const eslintPluginFlawless = await interopDefault(import("eslint-plugin-flawless"));

	const tsFilesTypeAware = [GLOB_TS];
	const tsxFilesTypeAware = [GLOB_TSX];
	const ignoresTypeAware = options.ignoresTypeAware ?? [`${GLOB_MARKDOWN}/**`, GLOB_DTS];
	const tsconfigPath = typeAware ? getTsConfig(options.tsconfigPath) : undefined;
	const isTypeAware = tsconfigPath !== undefined;

	return [
		{
			name: "isentinel/naming/setup",
			plugins: {
				flawless: eslintPluginFlawless,
			},
		},
		...(isTypeAware
			? [
					{
						name: "isentinel/naming/ts/rules-type-aware",
						files: tsFilesTypeAware,
						ignores: ignoresTypeAware,
						rules: {
							"flawless/naming-convention": [
								"error",
								...selectors,
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
									// Enforce that all top-level constants are
									// in UPPER_CASE
									format: ["UPPER_CASE"],
									leadingUnderscore: "forbid",
									modifiers: ["const", "global"],
									selector: "variable",
									trailingUnderscore: "forbid",
									types: ["boolean", "number", "string"],
								},
								{
									// Const-asserted data objects (`as const
									// satisfies T`) are frozen constants; pin
									// one casing to match global primitives
									format: ["UPPER_CASE"],
									modifiers: ["constAsserted", "global"],
									selector: "variable",
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
									prefix: [
										"is",
										"should",
										"has",
										"can",
										"did",
										"will",
										"was",
										"are",
									],
									selector: "variable",
									types: ["boolean"],
								},
								{
									// Enforce that global boolean constants are
									// in UPPER_CASE and are prefixed with an
									// allowed verb like "is", "should",
									filter: {
										match: false,
										regex: "^success$",
									},
									format: ["UPPER_CASE"],
									modifiers: ["const", "global"],
									prefix: [
										"IS_",
										"SHOULD_",
										"HAS_",
										"CAN_",
										"DID_",
										"WILL_",
										"WAS_",
										"ARE_",
									],
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
						name: "isentinel/naming/tsx/rules-type-aware",
						files: tsxFilesTypeAware,
						ignores: ignoresTypeAware,
						rules: {
							"flawless/naming-convention": [
								"error",
								...selectorsTsx,
								...selectors,
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
								...(isRoblox
									? [
											{
												// React components and contexts
												// conventionally use PascalCase
												format: ["StrictPascalCase"],
												selector: ["parameter", "variable"],
												types: [
													{ name: "Context", from: RBXTS_REACT },
													{ name: "FC", from: RBXTS_REACT },
													{
														name: "FunctionComponent",
														from: RBXTS_REACT,
													},
												],
											},
											{
												// components typed as anonymous
												// functions (e.g. `() =>
												// React.ReactNode`) have no
												// symbol name to match, so match
												// by return type instead;
												// permissive since camelCase
												// helpers can also return
												// elements. typeMethod covers
												// function-typed interface
												// members
												format: ["strictCamelCase", "StrictPascalCase"],
												selector: ["parameter", "typeMethod", "variable"],
												types: [
													{
														returns: {
															name: "Element",
															from: RBXTS_REACT,
														},
													},
													{
														returns: {
															name: "ReactNode",
															from: RBXTS_REACT,
														},
													},
												],
											},
										]
									: []),

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
									// Enforce that all top-level constants are
									// in UPPER_CASE
									format: ["UPPER_CASE"],
									leadingUnderscore: "forbid",
									modifiers: ["const", "global"],
									selector: "variable",
									trailingUnderscore: "forbid",
									types: ["boolean", "number", "string"],
								},
								{
									// Const-asserted data objects (`as const
									// satisfies T`) are frozen constants; pin
									// one casing to match global primitives
									format: ["UPPER_CASE"],
									modifiers: ["constAsserted", "global"],
									selector: "variable",
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
									prefix: [
										"is",
										"should",
										"has",
										"can",
										"did",
										"will",
										"was",
										"are",
									],
									selector: "variable",
									types: ["boolean"],
								},
								{
									// Enforce that global boolean constants are
									// in UPPER_CASE and are prefixed with an
									// allowed verb like "is", "should",
									filter: {
										match: false,
										regex: "^success$",
									},
									format: ["UPPER_CASE"],
									modifiers: ["const", "global"],
									prefix: [
										"IS_",
										"SHOULD_",
										"HAS_",
										"CAN_",
										"DID_",
										"WILL_",
										"WAS_",
										"ARE_",
									],
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
