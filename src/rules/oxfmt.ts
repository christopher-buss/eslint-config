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

/** A Prettier override, migrated to oxfmt's shape. */
// A type alias, not an interface, so it fits oxfmt's indexed override type.
export type MigratedOverride = {
	excludeFiles?: Array<string>;
	files: Array<string>;
	options: Record<string, unknown>;
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

		oxfmtOptions[key] = key === "overrides" ? migratePrettierOverrides(value) : value;
	}

	return oxfmtOptions;
}

/**
 * Migrate Prettier `overrides`: oxfmt wants `files` as an array, and the
 * nested options migrated like the root ones.
 *
 * @param overrides - The `overrides` value, of unknown shape.
 * @returns The overrides in oxfmt's shape; empty when not an array.
 */
export function migratePrettierOverrides(overrides: unknown): Array<MigratedOverride> {
	if (!Array.isArray(overrides)) {
		return [];
	}

	return overrides.flatMap((override: unknown) => {
		if (typeof override !== "object" || override === null) {
			return [];
		}

		const { excludeFiles, files, options } = override as Record<string, unknown>;
		return [
			{
				...(excludeFiles === undefined ? {} : { excludeFiles: stringsOf(excludeFiles) }),
				files: stringsOf(files),
				options:
					typeof options === "object" && options !== null
						? migratePrettierOptions(options as Record<string, unknown>)
						: {},
			},
		];
	});
}

/**
 * Anchor slash-less override globs to the config directory. The oxfmt CLI
 * matches `*.json` at any depth, but the ESLint rule matches it against the
 * path from the config directory, so only top-level files; `./*.json` means
 * the latter to both.
 *
 * @template T - The override shape.
 * @param overrides - Oxfmt overrides.
 * @returns The overrides with anchored globs.
 */
export function anchorOverrideGlobs<
	T extends { excludeFiles?: Array<string>; files: Array<string> },
>(overrides: ReadonlyArray<T>): Array<T> {
	function anchor(glob: string): string {
		const negated = glob.startsWith("!");
		const body = negated ? glob.slice(1) : glob;
		const anchored = body.includes("/") ? body : `./${body}`;
		return negated ? `!${anchored}` : anchored;
	}

	return overrides.map((override) => {
		return {
			...override,
			...(override.excludeFiles ? { excludeFiles: override.excludeFiles.map(anchor) } : {}),
			files: override.files.map(anchor),
		};
	});
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
 * Oxfmt would format code blocks with these options too, at the prose width.
 * It leaves them alone instead, and ESLint formats each block with the options
 * of its own language (see `isentinel/oxfmt/markdown-code/*`).
 *
 * @param jsdocPrintWidth - Width for Markdown prose; 80 when unset.
 * @returns Options applied on top of the base for Markdown files.
 */
export function markdownOxfmtOptions(jsdocPrintWidth: unknown): {
	embeddedLanguageFormatting: "off";
	printWidth: number;
	proseWrap: "always";
	tabWidth: number;
} {
	return {
		embeddedLanguageFormatting: "off" as const,
		printWidth: Number(jsdocPrintWidth) || 80,
		proseWrap: "always" as const,
		// The indent of nested list items.
		tabWidth: 2,
	} satisfies OxfmtOptions;
}

function stringsOf(value: unknown): Array<string> {
	return [value].flat().filter((item): item is string => typeof item === "string");
}

/**
 * JSON5 formatting options layered over the base options. `jsonc/quote-props`
 * owns the quoting of JSON5 keys; oxfmt's `consistent` would strip the quotes
 * it adds, and `--fix` would loop.
 */
export const JSON5_OXFMT_OPTIONS = {
	quoteProps: "preserve",
} as const satisfies OxfmtOptions;

/** YAML formatting options layered over the base options. */
export const YAML_OXFMT_OPTIONS = {
	tabWidth: 2,
	useTabs: false,
} as const satisfies OxfmtOptions;
