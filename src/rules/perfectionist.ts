import type { RuleOptions } from "../typegen.d.ts";
import type { OptionsProjectType, TypedFlatConfigItem } from "../types.ts";
import type { ExtractRuleOptions } from "../utils.ts";

type PatternType =
	| Array<string>
	| Array<{ flags?: string; pattern: string }>
	| string
	| { flags?: string; pattern: string };

interface CustomGroupDefinition {
	decoratorNamePattern?: PatternType;
	elementNamePattern?: PatternType;
	elementValuePattern?: PatternType;
	fallbackSort?: { order?: "asc" | "desc"; type: string };
	groupName: string;
	modifiers?: Array<string>;
	newlinesInside?: "ignore" | number;
	order?: "asc" | "desc";
	selector?: string;
	type?: "alphabetical" | "line-length" | "natural" | "unsorted";
}

type MethodType = "private" | "protected" | "public";

const constructorGroup = {
	elementNamePattern: "constructor",
	groupName: "custom-constructor",
} satisfies CustomGroupDefinition;

export interface PerfectionistRuleOptions extends OptionsProjectType {
	customClassGroups?: Array<string>;
	sortObjects?: Partial<
		ExtractRuleOptions<NonNullable<RuleOptions["perfectionist/sort-objects"]>>[0]
	>;
}

/** Shared perfectionist plugin settings for both factories. */
export const perfectionistSettings = {
	perfectionist: {
		order: "asc",
		partitionByComment: "^Part:\\s*(.*)$",
		type: "natural",
	},
} as const;

/**
 * `eslint-plugin/test-case-property-ordering` canon, with `name` hoisted to the
 * front. That rule is off (see `eslintPluginRules`) so perfectionist owns
 * rule-test ordering, which frees `name` from its "unlisted keys last" rule.
 */
const TEST_CASE_KEY_ORDER = [
	"name",
	"filename",
	"code",
	"output",
	"options",
	"parser",
	"languageOptions",
	"parserOptions",
	"globals",
	"env",
	"errors",
] as const;

const TEST_CASE_SELECTOR =
	"Property[key.name=/^(?:invalid|valid)$/] > ArrayExpression > ObjectExpression";
const TEST_CASE_DECLARATION = "^(?:in)?valid(?:Cases|TestCases|Tests)?$";

const testCaseGroups = {
	customGroups: TEST_CASE_KEY_ORDER.map((key) => {
		return { elementNamePattern: `^${key}$`, groupName: key };
	}),
	groups: [...TEST_CASE_KEY_ORDER, "unknown"],
};

/**
 * `sort-objects` configurations for rule-test cases. The first covers inline
 * `valid:`/`invalid:` arrays, the second cases extracted to an
 * `invalidCases`-style variable. Perfectionist takes the first entry whose
 * `useConfigurationIf` matches, so these must precede the catch-all.
 */
const testCaseSortConfigs = [
	{ ...testCaseGroups, useConfigurationIf: { matchesAstSelector: TEST_CASE_SELECTOR } },
	{ ...testCaseGroups, useConfigurationIf: { declarationMatchesPattern: TEST_CASE_DECLARATION } },
];

/**
 * Perfectionist rules shared between the ESLint and oxlint factories.
 *
 * @param config - Shared rule options.
 * @returns The rule map.
 */
export function perfectionistRules(
	config?: PerfectionistRuleOptions,
): TypedFlatConfigItem["rules"] {
	const { customClassGroups = [], sortObjects, type = "game" } = config ?? {};

	const customGroups = [
		...Array.from(customClassGroups, (customGroup) => {
			return { elementNamePattern: customGroup, groupName: customGroup };
		}),
		constructorGroup,
		createUnsortedMethod("private"),
		createUnsortedMethod("protected"),
		createUnsortedMethod("public"),
	];

	/** One `customGroups` entry for a method selector. */
	interface UnsortedMethodGroup {
		groupName: MethodType;
		modifiers: [MethodType];
		newlinesInside: number;
		selector: "method";
		type: "natural" | "unsorted";
	}

	function createUnsortedMethod(methodType: MethodType): UnsortedMethodGroup {
		return {
			groupName: methodType,
			modifiers: [methodType] as const,
			newlinesInside: 1,
			selector: "method" as const,
			type: type === "game" ? "unsorted" : "natural",
		} satisfies CustomGroupDefinition;
	}

	const sortedObjectConfig = sortObjects ?? {
		customGroups: [
			{ elementNamePattern: "^id$", groupName: "id" },
			{ elementNamePattern: "^key$", groupName: "key" },
			{ elementNamePattern: "^name$", groupName: "name" },
		],
		groups: ["id", "key", "name", "unknown"],
	};

	return {
		"perfectionist/sort-array-includes": ["error"],
		"perfectionist/sort-classes": [
			"warn",
			{
				customGroups,
				fallbackSort: { order: "asc", type: "natural" },
				groups: [
					"private-static-readonly-property",
					"private-readonly-property",
					"private-static-property",
					"private-property",

					"protected-static-readonly-property",
					"protected-readonly-property",
					"protected-static-property",
					"protected-property",

					"public-static-readonly-property",
					"public-readonly-property",
					"public-static-property",
					"public-property",

					"custom-constructor",

					...customClassGroups.reduce<Array<string>>((accumulator, item) => {
						accumulator.push(item);
						return accumulator;
					}, []),

					"public",
					"protected",
					"private",

					"unknown",
				],
				newlinesBetween: 1,
				useExperimentalDependencyDetection: true,
			},
		],
		"perfectionist/sort-decorators": ["error"],
		"perfectionist/sort-enums": [
			"error",
			{
				sortByValue: "always",
			},
		],
		"perfectionist/sort-exports": ["error"],
		"perfectionist/sort-heritage-clauses": [
			"error",
			{
				customGroups: customClassGroups.map((item) => {
					return {
						elementNamePattern: `^${capitalizeFirstLetter(item)}$`,
						groupName: item,
					};
				}),
				groups: [...customClassGroups, "unknown"],
			},
		],
		"perfectionist/sort-interfaces": ["error", { ...sortedObjectConfig }],
		"perfectionist/sort-intersection-types": ["error"],
		"perfectionist/sort-maps": ["error"],
		"perfectionist/sort-named-imports": ["error"],
		"perfectionist/sort-object-types": ["error"],
		"perfectionist/sort-objects": ["error", ...testCaseSortConfigs, { ...sortedObjectConfig }],
		"perfectionist/sort-sets": ["error"],
		"perfectionist/sort-switch-case": ["error"],
		"perfectionist/sort-union-types": ["error"],
		"perfectionist/sort-variable-declarations": ["error"],
		...(type === "package"
			? {
					"perfectionist/sort-modules": ["error", { type: "usage" }],
				}
			: {}),
	};
}

/**
 * JSX-specific perfectionist rules shared between the ESLint and oxlint
 * factories.
 *
 * @param config - Shared rule options.
 * @returns The rule map.
 */
export function perfectionistJsxRules(
	config?: PerfectionistRuleOptions,
): TypedFlatConfigItem["rules"] {
	const { sortObjects } = config ?? {};

	const sortedObjectJsxConfig = sortObjects ?? {
		customGroups: [
			{ elementNamePattern: "^id$", groupName: "id" },
			{ elementNamePattern: "^key$", groupName: "key" },
			{ elementNamePattern: "^name$", groupName: "name" },
			{ elementNamePattern: ["\b(on[A-Z][a-zA-Z]*)\b"], groupName: "callbacks" },
			{ elementNamePattern: ["^children$", "^ref$"], groupName: "react" },
		],
		groups: ["id", "key", "name", "unknown", "react", "callbacks"],
	};

	return {
		"perfectionist/sort-interfaces": ["error", { ...sortedObjectJsxConfig }],
		"perfectionist/sort-jsx-props": [
			"error",
			{
				customGroups: [
					{
						elementNamePattern: "^(?:key|ref)$",
						groupName: "reserved",
					},
					{
						elementNamePattern: "^on.+",
						groupName: "callback",
					},
				],
				groups: ["reserved", "shorthand-prop", "unknown", "callback"],
			},
		],
		"perfectionist/sort-objects": [
			"error",
			...testCaseSortConfigs,
			{ ...sortedObjectJsxConfig },
		],
	};
}

function capitalizeFirstLetter(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
