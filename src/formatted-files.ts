/**
 * The files the preset formats with oxfmt. ESLint mode enables `oxfmt/oxfmt`
 * on these globs; the standalone oxfmt config ignores every other file. One
 * list keeps both modes formatting the same files.
 *
 * Imported by the standalone oxfmt config, so keep it light.
 */

import {
	GLOB_ALL_JSON,
	GLOB_CSS,
	GLOB_JS,
	GLOB_JSX,
	GLOB_LESS,
	GLOB_MARKDOWN,
	GLOB_POSTCSS,
	GLOB_SCSS,
	GLOB_TS,
	GLOB_TSX,
	GLOB_YAML,
} from "./globs.ts";
import type { OptionsFormatters } from "./types.ts";

/** The languages `formatters` turns on and off. */
export type FormattedLanguages = Pick<
	OptionsFormatters,
	"css" | "graphql" | "html" | "json" | "markdown" | "yaml"
>;

/** Which files are formatted. */
export interface FormattedFilesOptions {
	/** Component extensions formatted with TypeScript, without the dot. */
	componentExts?: Array<string>;
	/**
	 * Languages to format besides JS and TS; `false` formats JS and TS only.
	 * Default `true`.
	 */
	formatters?: boolean | FormattedLanguages;
}

/** Formatted globs, by `oxfmt/oxfmt` config block. */
export const FORMATTED_FILES = {
	css: [GLOB_CSS, GLOB_POSTCSS],
	graphql: ["**/*.graphql"],
	html: ["**/*.html"],
	javascript: [GLOB_JS, GLOB_JSX],
	json: [GLOB_ALL_JSON],
	less: [GLOB_LESS],
	markdown: [GLOB_MARKDOWN],
	scss: [GLOB_SCSS],
	typescript: [GLOB_TS, GLOB_TSX],
	yaml: [GLOB_YAML],
} as const satisfies Record<string, ReadonlyArray<string>>;

/** The blocks `formatters` turns off, with the key that does it. */
const LANGUAGE_BLOCKS = [
	["css", "css"],
	["scss", "css"],
	["less", "css"],
	["html", "html"],
	["markdown", "markdown"],
	["graphql", "graphql"],
	["json", "json"],
	["yaml", "yaml"],
] as const;

/**
 * Resolve `formatters` to one flag per language.
 *
 * @param formatters - The `formatters` option.
 * @returns Whether each language is formatted.
 */
export function resolveFormattedLanguages(
	formatters: boolean | FormattedLanguages = true,
): Required<FormattedLanguages> {
	const enabled = formatters !== false;
	const toggles = typeof formatters === "object" ? formatters : {};
	return {
		css: enabled && toggles.css !== false,
		graphql: enabled && toggles.graphql !== false,
		html: enabled && toggles.html !== false,
		json: enabled && toggles.json !== false,
		markdown: enabled && toggles.markdown !== false,
		yaml: enabled && toggles.yaml !== false,
	};
}

/**
 * Every glob the preset formats.
 *
 * @param options - Component extensions and language toggles.
 * @returns The formatted globs.
 */
export function formattedFiles({
	componentExts: componentExtensions = [],
	formatters = true,
}: FormattedFilesOptions = {}): Array<string> {
	const languages = resolveFormattedLanguages(formatters);
	return [
		...FORMATTED_FILES.javascript,
		...FORMATTED_FILES.typescript,
		...componentExtensions.map((extension) => `**/*.${extension}`),
		...LANGUAGE_BLOCKS.filter(([, language]) => languages[language]).flatMap(([block]) => {
			return FORMATTED_FILES[block];
		}),
	];
}

/**
 * Expand the brace sets in a glob (`*.{,c,m}js` to `*.js`, `*.cjs`, `*.mjs`).
 *
 * @param glob - A glob.
 * @returns The globs it stands for.
 */
export function expandBraces(glob: string): Array<string> {
	const open = glob.indexOf("{");
	if (open === -1) {
		return [glob];
	}

	let depth = 0;
	let close = -1;
	const commas: Array<number> = [];
	for (let index = open; index < glob.length; index++) {
		const character = glob[index];
		if (character === "{") {
			depth++;
		} else if (character === "}") {
			depth--;
			if (depth === 0) {
				close = index;
				break;
			}
		} else if (character === "," && depth === 1) {
			commas.push(index);
		}
	}

	if (close === -1) {
		return [glob];
	}

	const bounds = [open, ...commas, close];
	const alternatives = bounds.slice(0, -1).map((start, index) => {
		return glob.slice(start + 1, bounds[index + 1]);
	});
	const prefix = glob.slice(0, open);
	const suffix = glob.slice(close + 1);
	return alternatives.flatMap((alternative) => expandBraces(`${prefix}${alternative}${suffix}`));
}

/**
 * Oxfmt ignore patterns that leave only the formatted files: ignore
 * everything, then re-include directories and each formatted glob. Ignore
 * files take no brace sets, so those are expanded.
 *
 * @param options - Component extensions and language toggles.
 * @returns Gitignore-style patterns.
 */
export function unformattedFilePatterns(options: FormattedFilesOptions = {}): Array<string> {
	const included = formattedFiles(options).flatMap((glob) => expandBraces(glob));
	return ["*", "!*/", ...Array.from(new Set(included), (glob) => `!${glob}`)];
}
