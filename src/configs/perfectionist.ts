import { GLOB_SRC } from "../globs";
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
	const { customClassGroups = [], type = "game" } = config ?? {};

	const customGroups = [];
	for (const customGroup of customClassGroups) {
		customGroups.push({
			elementNamePattern: customGroup,
			groupName: customGroup,
		});
	}

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
			files: [GLOB_SRC],
			name: "isentinel/perfectionist",
			rules: {
				"perfectionist/sort-array-includes": ["error", { type: "natural" }],
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
						newlinesBetween: "always",
						type: "natural",
					},
				],
				"perfectionist/sort-enums": [
					"error",
					{
						forceNumericSort: true,
						partitionByComment: "^Part:\\s*(.*)$",
						type: "natural",
					},
				],
				"perfectionist/sort-exports": ["error", { type: "natural" }],
				"perfectionist/sort-heritage-clauses": [
					"error",
					{
						customGroups: customClassGroups.reduce<Record<string, string>>(
							(accumulator, item) => {
								accumulator[item] = "^" + capitalizeFirstLetter(item) + "$";
								return accumulator;
							},
							{},
						),
						groups: [...customClassGroups, "unknown"],
						type: "natural",
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
						order: "asc",
						type: "natural",
					},
				],
				"perfectionist/sort-interfaces": [
					"error",
					{
						customGroups: { callbacks: ["\b(on[A-Z][a-zA-Z]*)\b"] },
						groups: ["unknown", "callbacks"],
						type: "natural",
					},
				],
				"perfectionist/sort-intersection-types": ["error", { type: "natural" }],
				"perfectionist/sort-jsx-props": "off",
				"perfectionist/sort-maps": ["error", { type: "natural" }],
				"perfectionist/sort-object-types": ["error", { type: "natural" }],
				"perfectionist/sort-objects": [
					"error",
					{ partitionByComment: "^Part:\\s*(.*)$", type: "natural" },
				],
				"perfectionist/sort-sets": ["error", { type: "natural" }],
				"perfectionist/sort-switch-case": ["error", { type: "natural" }],

				"perfectionist/sort-union-types": ["error", { type: "natural" }],
				"perfectionist/sort-variable-declarations": ["error", { type: "natural" }],

				...(type === "package"
					? {
							"perfectionist/sort-modules": "error",
						}
					: {}),
			},
		},
	];
}

function capitalizeFirstLetter(value: string): string {
	return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}
