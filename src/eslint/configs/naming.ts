import { ROBLOX_ALLOWED_WORDS } from "../../generated/roblox-allowed-words.ts";
import { GLOB_DTS, GLOB_MARKDOWN, GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { getTsConfig, interopDefault } from "../../utils.ts";
import type {
	NamingConfig,
	NamingSelector,
	OptionsTypeScriptParserOptions,
	OptionsTypeScriptWithTypes,
	TypedFlatConfigItem,
} from "../types.ts";

const RBXTS_REACT = "@rbxts/react";

/**
 * Component-valued types from `@rbxts/react`.
 *
 * `ComponentType` is an alias for `ComponentClass | FunctionComponent`, and the
 * type matcher splits unions before matching, so both members have to be listed
 * for a `ComponentType`-annotated name to match.
 */
const REACT_COMPONENT_TYPES = [
	{ name: "ComponentClass", from: RBXTS_REACT },
	{ name: "Context", from: RBXTS_REACT },
	{ name: "ExoticComponent", from: RBXTS_REACT },
	{ name: "FC", from: RBXTS_REACT },
	{ name: "ForwardRefExoticComponent", from: RBXTS_REACT },
	{ name: "FunctionComponent", from: RBXTS_REACT },
	{ name: "LazyExoticComponent", from: RBXTS_REACT },
	{ name: "MemoExoticComponent", from: RBXTS_REACT },
	{ name: "NamedExoticComponent", from: RBXTS_REACT },
];

const REACT_ELEMENT_RETURN_TYPES = [
	{ returns: { name: "Element", from: RBXTS_REACT } },
	{ returns: { name: "ReactNode", from: RBXTS_REACT } },
];

export async function naming(
	options: NamingConfig & OptionsTypeScriptParserOptions & OptionsTypeScriptWithTypes = {},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		allowedWords = false,
		overridesTypeAware = {},
		roblox: isRoblox = true,
		selectors = [],
		selectorsTsx = [],
		typeAware = true,
	} = options;

	const eslintPluginFlawless = await interopDefault(import("eslint-plugin-flawless"));

	// One shared list rather than a copy on every selector: the rule reads
	// `settings.flawless.namingConvention.allowedWords` for any selector that
	// does not carry its own, which covers the defaults below and anything
	// passed through `selectors`.
	const configuredWords = allowedWords === true ? ROBLOX_ALLOWED_WORDS : allowedWords;
	const words =
		configuredWords === false || configuredWords.length === 0 ? undefined : configuredWords;

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
			...(words !== undefined
				? {
						settings: {
							flawless: {
								namingConvention: { allowedWords: words },
							},
						},
					}
				: {}),
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
								...(isRoblox ? reactSelectors() : []),
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
								...(isRoblox ? reactSelectors() : []),

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

/**
 * Selectors that let React component values carry component casing.
 *
 * @returns The naming-convention selectors for `@rbxts/react` types.
 */
function reactSelectors(): Array<NamingSelector> {
	return [
		{
			// React components and contexts conventionally use PascalCase
			format: ["StrictPascalCase"],
			selector: ["parameter", "variable"],
			types: REACT_COMPONENT_TYPES,
		},
		{
			// Properties holding a component are named for the component, but
			// camelCase stays legal so existing props do not have to move
			format: ["strictCamelCase", "StrictPascalCase"],
			selector: ["classProperty", "typeProperty"],
			types: REACT_COMPONENT_TYPES,
		},
		{
			// components typed as anonymous functions (e.g. `() =>
			// React.ReactNode`) have no symbol name to match, so match by return
			// type instead; permissive since camelCase helpers can also return
			// elements. typeMethod covers function-typed interface members
			format: ["strictCamelCase", "StrictPascalCase"],
			selector: ["parameter", "typeMethod", "variable"],
			types: REACT_ELEMENT_RETURN_TYPES,
		},
	];
}
