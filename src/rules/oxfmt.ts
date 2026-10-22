import type { OxfmtOptions } from "../utils.ts";

const UNSUPPORTED_PRETTIER_KEYS = new Set([
	"experimentalOperatorPosition",
	"experimentalTernaries",
	"jsdocPreferCodeFences",
	"jsdocPrintWidth",
	"parser",
	"plugins",
	"tsdoc",
]);

const defaultSortImports = {
	customGroups: [
		{ elementNamePattern: ["react"], groupName: "react" },
		{ elementNamePattern: ["@*/**"], groupName: "scoped" },
	],
	groups: [
		"react",
		"scoped",
		["type-builtin", "type-external", "builtin", "external"],
		[
			"type-internal",
			"internal",
			"type-parent",
			"type-sibling",
			"type-index",
			"parent",
			"sibling",
			"index",
		],
		"unknown",
	],
	newlinesBetween: true,
};

/**
 * Migrate Prettier options to oxfmt options, dropping unsupported keys.
 *
 * @param prettierOptions - The Prettier options to migrate.
 * @returns The migrated oxfmt options.
 */
export function migratePrettierOptions(
	prettierOptions: Record<string, unknown>,
): Record<string, unknown> {
	const oxfmtOptions: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(prettierOptions)) {
		if (UNSUPPORTED_PRETTIER_KEYS.has(key)) {
			continue;
		}

		if (key === "endOfLine" && value === "auto") {
			continue;
		}

		oxfmtOptions[key] = value;
	}

	return oxfmtOptions;
}

/**
 * Build the effective oxfmt options shared between the ESLint and oxlint
 * factories.
 *
 * @param options - The option sources, in increasing precedence.
 * @returns The effective oxfmt options.
 */
export function buildOxfmtOptions({
	oxfmtConfigOptions = {},
	oxfmtOptions,
	prettierOptions = {},
}: {
	oxfmtConfigOptions?: OxfmtOptions;
	oxfmtOptions?: OxfmtOptions;
	prettierOptions?: Record<string, unknown>;
}): OxfmtOptions {
	return {
		sortImports: defaultSortImports,
		sortPackageJson: false,
		...migratePrettierOptions(prettierOptions),
		...oxfmtConfigOptions,
		...oxfmtOptions,
	} satisfies OxfmtOptions;
}

/**
 * Markdown formatting options layered over the base options. Shared by the
 * ESLint config and the standalone oxfmt config so both format Markdown the
 * same way.
 *
 * @param jsdocPrintWidth - Width for Markdown prose; 80 when unset.
 * @returns Options applied on top of the base for Markdown files.
 */
export function markdownOxfmtOptions(jsdocPrintWidth: unknown): {
	printWidth: number;
	proseWrap: "always";
	tabWidth: number;
} {
	return {
		printWidth: Number(jsdocPrintWidth) || 80,
		proseWrap: "always" as const,
		// Embedded code blocks (e.g. YAML) that forbid tab indentation fall
		// back to spaces; use 2 so they match the YAML options instead of the
		// base width.
		tabWidth: 2,
	} satisfies OxfmtOptions;
}

/** YAML formatting options layered over the base options. */
export const YAML_OXFMT_OPTIONS = {
	tabWidth: 2,
	useTabs: false,
} as const satisfies OxfmtOptions;
