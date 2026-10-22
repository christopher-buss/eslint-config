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

import { GLOB_EXCLUDE, GLOB_JSON5, GLOB_MARKDOWN, GLOB_YAML } from "../globs.ts";
import { resolvePrettierSettings } from "../prettier-config.ts";
import {
	buildOxfmtOptions,
	JSON5_OXFMT_OPTIONS,
	markdownOxfmtOptions,
	YAML_OXFMT_OPTIONS,
} from "../rules/oxfmt.ts";

export type { OxfmtConfig } from "oxfmt";

/** Options for {@link isentinelOxfmt}: an oxfmt config, plus `cwd`. */
export type IsentinelOxfmtOptions = OxfmtConfig & {
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
 * user override wins over the preset's Markdown and YAML overrides. Only the
 * root `.prettierrc` options are carried over; its `overrides` are not.
 *
 * @param config - Options that replace the preset's, plus extra ignore
 *   patterns and overrides.
 * @param config.cwd - Directory to resolve `.prettierrc` and `.editorconfig`
 *   from (default `process.cwd()`).
 * @param config.ignorePatterns - Appended to the preset's ignore patterns.
 * @param config.overrides - Appended to the preset's Markdown and YAML
 *   overrides.
 * @returns The oxfmt config.
 */
export function isentinelOxfmt({
	cwd,
	ignorePatterns = [],
	overrides = [],
	...rest
}: IsentinelOxfmtOptions = {}): OxfmtConfig {
	const prettierSettings: Record<string, unknown> = resolvePrettierSettings({}, cwd);
	const base = buildOxfmtOptions({ prettierOptions: prettierSettings });

	return {
		...base,
		...rest,
		ignorePatterns: [...GLOB_EXCLUDE, ...ignorePatterns],
		overrides: [
			{
				files: [GLOB_MARKDOWN],
				options: markdownOxfmtOptions(prettierSettings["jsdocPrintWidth"]),
			},
			{ files: [GLOB_YAML], options: { ...YAML_OXFMT_OPTIONS } },
			{ files: [GLOB_JSON5], options: { ...JSON5_OXFMT_OPTIONS } },
			...overrides,
		],
	};
}
