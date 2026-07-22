// cspell:words typeaware
import { parseBoundedInteger } from "../cli/parse.ts";

/**
 * When the TS builder flags more than this many affected files, surgical
 * removal stops paying off: the runner deletes the mode's cache file wholesale
 * and treats every file as dirty. Overridable via
 * `LINT_AFFECTED_BUST_THRESHOLD`.
 */
export const AFFECTED_BUST_THRESHOLD = 1000;

/**
 * Base name of every ESLint cache file the runner manages. Each real file adds
 * a pass suffix and a config-variant key (see {@link cacheFileFor}), so this
 * doubles as the prefix the whole-cache sweep matches on.
 */
export const CACHE_FILE_PREFIX = ".eslintcache";

/** ESLint cache base name used when no type-aware mode is selected. */
export const CACHE_FILE_DEFAULT = CACHE_FILE_PREFIX;

/** ESLint cache base name used for `--type-aware=off` (syntactic-only) runs. */
export const CACHE_FILE_FAST = `${CACHE_FILE_PREFIX}-fast`;

/** ESLint cache base name used for `--type-aware=only` runs. */
export const CACHE_FILE_TYPE_AWARE = `${CACHE_FILE_PREFIX}-typeaware`;

/** Every ESLint cache base name the runner manages. */
export const ALL_CACHE_FILES = [
	CACHE_FILE_DEFAULT,
	CACHE_FILE_FAST,
	CACHE_FILE_TYPE_AWARE,
] as const;

/**
 * Suffix a cache base name with the run's config-variant key. Two runs whose
 * resolved ESLint configs differ get different keys and therefore different
 * files, so neither can invalidate the other's entries via ESLint's per-entry
 * `hashOfConfig`.
 *
 * @param baseName - The pass's cache base name (see {@link ALL_CACHE_FILES}).
 * @param key - The variant key from `resolveCacheKey`.
 * @returns The keyed cache file name, relative to the working directory.
 */
export function cacheFileFor(baseName: string, key: string): string {
	return `${baseName}-${key}`;
}

/**
 * Resolve the affected-set bust threshold, honouring the
 * `LINT_AFFECTED_BUST_THRESHOLD` override.
 *
 * @param environment - The environment variables to read the override from.
 * @returns The resolved threshold.
 */
export function resolveAffectedBustThreshold(environment: NodeJS.ProcessEnv): number {
	return (
		parseBoundedInteger(environment["LINT_AFFECTED_BUST_THRESHOLD"], 0) ??
		AFFECTED_BUST_THRESHOLD
	);
}
