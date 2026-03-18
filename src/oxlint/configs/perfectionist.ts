import type { PerfectionistConfig } from "../../eslint/types.ts";
import { GLOB_JSX, GLOB_SRC, GLOB_TSX } from "../../globs.ts";
import type { JsPluginRules, OptionsProjectType, TypedOxlintConfigItem } from "../types.ts";

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

const perfectionistJsPlugins = [
	{ name: "perfectionist", specifier: "eslint-plugin-perfectionist" },
];

export function perfectionist(
	config?: OptionsProjectType & PerfectionistConfig,
): Array<TypedOxlintConfigItem> {
	const { customClassGroups = [], sortObjects, type = "game" } = config ?? {};

	const customGroups = [];
	for (const customGroup of customClassGroups) {
		customGroups.push({
			elementNamePattern: customGroup,
			groupName: customGroup,
		});
	}

	const sortedObjectConfig = sortObjects ?? {
		customGroups: [
			{ elementNamePattern: "^id$", groupName: "id" },
			{ elementNamePattern: "^key$", groupName: "key" },
			{ elementNamePattern: "^name$", groupName: "name" },
		],
		groups: ["id", "key", "name", "unknown"],
	};

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

	function createUnsortedMethod(methodType: MethodType): {
		groupName: MethodType;
		modifiers: [MethodType];
		newlinesInside: number;
		selector: "method";
		type: "natural" | "unsorted";
	} {
		return {
			groupName: methodType,
			modifiers: [methodType] as const,
			newlinesInside: 1,
			selector: "method" as const,
			type: type === "game" ? "unsorted" : "natural",
		} satisfies CustomGroupDefinition;
	}

	customGroups.push(
		constructorGroup,
		createUnsortedMethod("private"),
		createUnsortedMethod("protected"),
		createUnsortedMethod("public"),
	);

	const jsPluginRules = {
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
		"perfectionist/sort-objects": ["error", { ...sortedObjectConfig }],
		"perfectionist/sort-sets": ["error"],
		"perfectionist/sort-switch-case": ["error"],
		"perfectionist/sort-union-types": ["error"],
		"perfectionist/sort-variable-declarations": ["error"],
		...(type === "package"
			? {
					"perfectionist/sort-modules": ["error", { type: "usage" }],
				}
			: {}),
	} satisfies JsPluginRules;

	const jsxJsPluginRules = {
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
		"perfectionist/sort-objects": ["error", { ...sortedObjectJsxConfig }],
	} satisfies JsPluginRules;

	return [
		{
			name: "isentinel/oxlint/perfectionist",
			files: [GLOB_SRC],
			jsPlugins: perfectionistJsPlugins,
			rules: jsPluginRules,
			settings: {
				perfectionist: {
					order: "asc",
					partitionByComment: "^Part:\\s*(.*)$",
					type: "natural",
				},
			},
		},
		{
			name: "isentinel/oxlint/perfectionist/jsx",
			files: [GLOB_JSX, GLOB_TSX],
			jsPlugins: perfectionistJsPlugins,
			rules: jsxJsPluginRules,
		},
	];
}

function capitalizeFirstLetter(value: string): string {
	return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}
