import { GLOB_JSX, GLOB_SRC, GLOB_TSX } from "../globs";
import type { OptionsProjectType, PerfectionistConfig, TypedFlatConfigItem } from "../types";
import { interopDefault } from "../utils";

interface CustomGroupDefinition {
	decoratorNamePattern?: PatternType;
	elementNamePattern?: PatternType;
	elementValuePattern?: PatternType;
	fallbackSort?: { order?: "asc" | "desc"; type: string };
	groupName: string;
	modifiers?: Array<string>;
	newlinesInside?: "always" | "ignore" | "never";
	order?: "asc" | "desc";
	selector?: string;
	type?: "alphabetical" | "line-length" | "natural" | "unsorted";
}

type MethodType = "private" | "protected" | "public";

type PatternType =
	| Array<string>
	| Array<{ flags?: string; pattern: string }>
	| string
	| { flags?: string; pattern: string };

const constructorGroup = {
	elementNamePattern: "constructor",
	groupName: "custom-constructor",
} satisfies CustomGroupDefinition;

/**
 * Perfectionist plugin for props and items sorting.
 *
 * @param config - An optional configuration object for the plugin.
 * @returns The configuration.
 * @see https://github.com/azat-io/eslint-plugin-perfectionist
 */
export async function perfectionist(
	config?: OptionsProjectType & PerfectionistConfig,
): Promise<Array<TypedFlatConfigItem>> {
	const { customClassGroups = [], sortObjects, type = "game" } = config ?? {};

	const customGroups = [];
	for (const customGroup of customClassGroups) {
		customGroups.push({
			elementNamePattern: customGroup,
			groupName: customGroup,
		});
	}

	const sortedObjectConfig = sortObjects ?? {
		customGroups: {
			id: "^id$",
			key: "^key$",
			name: "^name$",
		},
		groups: ["id", "key", "name", "unknown"],
	};

	const sortedObjectJsxConfig = sortObjects ?? {
		customGroups: {
			id: "^id$",
			key: "^key$",
			name: "^name$",
			callbacks: ["\b(on[A-Z][a-zA-Z]*)\b"],
			react: ["^children$", "^ref$"],
		},
		groups: ["id", "key", "name", "unknown", "react", "callbacks"],
	};

	function createUnsortedMethod(methodType: MethodType): {
		groupName: MethodType;
		modifiers: [MethodType];
		newlinesInside: "always";
		selector: string;
		type: "natural" | "unsorted";
	} {
		return {
			groupName: methodType,
			modifiers: [methodType] as const,
			newlinesInside: "always",
			selector: "method",
			type: type === "game" ? "unsorted" : "natural",
		} satisfies CustomGroupDefinition;
	}

	customGroups.push(
		constructorGroup,
		createUnsortedMethod("private"),
		createUnsortedMethod("protected"),
		createUnsortedMethod("public"),
	);

	const pluginPerfectionist = await interopDefault(import("eslint-plugin-perfectionist"));

	return [
		{
			name: "isentinel/perfectionist/setup",
			plugins: {
				perfectionist: pluginPerfectionist,
			},
		},
		{
			name: "isentinel/perfectionist",
			files: [GLOB_SRC],
			rules: {
				"perfectionist/sort-array-includes": ["error"],
				"perfectionist/sort-classes": [
					"warn",
					{
						customGroups,
						fallbackSort: { order: "asc" },
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
						newlinesBetween: "always",
					},
				],
				"perfectionist/sort-decorators": ["error"],
				"perfectionist/sort-enums": [
					"error",
					{
						forceNumericSort: true,
					},
				],
				"perfectionist/sort-exports": ["error"],
				"perfectionist/sort-heritage-clauses": [
					"error",
					{
						customGroups: customClassGroups.reduce<Record<string, string>>(
							(accumulator, item) => {
								accumulator[item] = `^${capitalizeFirstLetter(item)}$`;
								return accumulator;
							},
							{},
						),
						groups: [...customClassGroups, "unknown"],
					},
				],
				// Import and export sorting
				"perfectionist/sort-imports": [
					"error",
					{
						customGroups: [
							{
								elementNamePattern: "^react$",
								groupName: "react",
							},
							{
								elementNamePattern: "^@",
								groupName: "scoped",
							},
						],
						groups: [
							"react",
							"scoped",
							["type-builtin", "type-external", "value-builtin", "value-external"],
							[
								"type-internal",
								"value-internal",
								"type-parent",
								"type-sibling",
								"type-index",
								"value-parent",
								"value-sibling",
								"value-index",
							],
							"unknown",
						],
						newlinesBetween: "always",
					},
				],
				"perfectionist/sort-interfaces": ["error", { ...sortedObjectConfig }],
				"perfectionist/sort-intersection-types": ["error"],
				"perfectionist/sort-jsx-props": "off",
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
							"perfectionist/sort-modules": "error",
						}
					: {}),
			},
			settings: {
				perfectionist: {
					order: "asc",
					partitionByComment: "^Part:\\s*(.*)$",
					type: "natural",
				},
			},
		},
		{
			name: "isentinel/perfectionist/jsx",
			files: [GLOB_JSX, GLOB_TSX],
			rules: {
				"perfectionist/sort-interfaces": ["error", { ...sortedObjectJsxConfig }],
				"perfectionist/sort-objects": ["error", { ...sortedObjectJsxConfig }],
			},
		},
	];
}

function capitalizeFirstLetter(value: string): string {
	return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}
