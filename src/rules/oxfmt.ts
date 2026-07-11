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
