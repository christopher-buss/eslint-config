import type { Options as PrettierOptions } from "prettier";

import type { OxfmtOptions } from "../utils.ts";

/** One value from a Prettier config, as it is carried over to oxfmt. */
type PrettierOptionValue = PrettierOptions[keyof PrettierOptions];

/** Prettier keys that survive the migration, before oxfmt's own keys win. */
type OxfmtSettings = Record<string, PrettierOptionValue>;

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
export function migratePrettierOptions(prettierOptions: PrettierOptions): OxfmtSettings {
	return Object.fromEntries(
		Object.entries(prettierOptions).filter(([key, value]) => {
			return !UNSUPPORTED_PRETTIER_KEYS.has(key) && (key !== "endOfLine" || value !== "auto");
		}),
	);
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
	prettierOptions?: PrettierOptions;
}): OxfmtOptions {
	return {
		sortImports: defaultSortImports,
		sortPackageJson: false,
		...migratePrettierOptions(prettierOptions),
		...oxfmtConfigOptions,
		...oxfmtOptions,
	} satisfies OxfmtOptions;
}
