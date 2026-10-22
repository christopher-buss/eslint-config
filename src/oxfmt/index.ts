/**
 * Standalone oxfmt config. A consumer that runs oxfmt as its own tool (the
 * `formatter: "standalone"` mode) re-exports this from `oxfmt.config.ts`, so
 * the preset stays the one place that defines the default format options.
 *
 * Keep this module light: the ESLint and oxlint factories load the consumer's
 * `oxfmt.config.ts`, which imports this module, so it must not import either
 * factory.
 */

import type { OxfmtConfig } from "oxfmt";

import { resolveFormattedLanguages, unformattedFilePatterns } from "../formatted-files.ts";
import type { FormattedFilesOptions } from "../formatted-files.ts";
import { GLOB_EXCLUDE, GLOB_JSON5, GLOB_MARKDOWN, GLOB_YAML } from "../globs.ts";
import { resolvePrettierSettings } from "../prettier-config.ts";
import {
	buildOxfmtOptions,
	JSON5_OXFMT_OPTIONS,
	markdownOxfmtOptions,
	YAML_OXFMT_OPTIONS,
} from "../rules/oxfmt.ts";

export type { OxfmtConfig } from "oxfmt";

/**
 * Options for {@link isentinelOxfmt}: an oxfmt config, plus the preset's own.
 */
export type IsentinelOxfmtOptions = FormattedFilesOptions &
	OxfmtConfig & {
		/** Directory to resolve `.prettierrc` and `.editorconfig` from. */
		cwd?: string;
	};

/**
 * Build the preset's oxfmt config.
 *
 * Root format options start from the same defaults the ESLint and oxlint
 * factories use (preset defaults < `.editorconfig` < `.prettierrc`), and every
 * key in `config` replaces its base value. `ignorePatterns` and `overrides`
 * are the exception: the user's entries are appended to the preset's, so a
 * user override wins over the preset's Markdown, YAML and JSON5 overrides.
 * Only the root `.prettierrc` options are carried over; its `overrides` are
 * not.
 *
 * Oxfmt formats the files ESLint mode formats, and no others: TOML, `.mdx` and
 * the like stay as they are.
 *
 * @param config - Options that replace the preset's, plus extra ignore
 *   patterns and overrides.
 * @param config.componentExts - Component extensions to format, as the
 *   factories' `componentExts`.
 * @param config.cwd - Directory to resolve `.prettierrc` and `.editorconfig`
 *   from (default `process.cwd()`).
 * @param config.formatters - Languages to format besides JS and TS, as the
 *   factories' `formatters`.
 * @param config.ignorePatterns - Appended to the preset's ignore patterns.
 * @param config.overrides - Appended to the preset's overrides.
 * @returns The oxfmt config.
 */
export function isentinelOxfmt({
	componentExts,
	cwd,
	formatters,
	ignorePatterns = [],
	overrides = [],
	...rest
}: IsentinelOxfmtOptions = {}): OxfmtConfig {
	const prettierSettings: Record<string, unknown> = resolvePrettierSettings({}, cwd);
	const base = buildOxfmtOptions({ prettierOptions: prettierSettings });
	const languages = resolveFormattedLanguages(formatters);

	return {
		...base,
		...rest,
		ignorePatterns: [
			...unformattedFilePatterns({ componentExts, formatters }),
			...GLOB_EXCLUDE,
			...ignorePatterns,
		],
		overrides: [
			...(languages.markdown
				? [
						{
							files: [GLOB_MARKDOWN],
							options: markdownOxfmtOptions(prettierSettings["jsdocPrintWidth"]),
						},
					]
				: []),
			...(languages.yaml ? [{ files: [GLOB_YAML], options: { ...YAML_OXFMT_OPTIONS } }] : []),
			...(languages.json
				? [{ files: [GLOB_JSON5], options: { ...JSON5_OXFMT_OPTIONS } }]
				: []),
			...overrides,
		],
	};
}
