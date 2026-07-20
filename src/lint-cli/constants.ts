// cspell:words lintable typeaware undercounting
import { parseBoundedInteger } from "./parse.ts";

/** Default number of files a single ESLint worker should handle. */
export const DEFAULT_FILES_PER_WORKER = 350;

/**
 * Default files-per-worker for the fast (`--type-aware=off`) pass. A syntactic
 * lint costs ~15ms/file against a fixed ~3s config-load per worker, so the
 * break-even against spinning up another worker sits far higher than the
 * type-aware pass — roughly 800 files. Overridable via `FAST_FILES_PER_WORKER`.
 */
export const DEFAULT_FAST_FILES_PER_WORKER = 800;

/**
 * When the TS builder flags more than this many affected files, surgical
 * removal stops paying off: the runner deletes the mode's cache file wholesale
 * and treats every file as dirty. Overridable via
 * `LINT_AFFECTED_BUST_THRESHOLD`.
 */
export const AFFECTED_BUST_THRESHOLD = 1000;

/** Matches a flat-config entry-point basename (`eslint.config.*`). */
export const ESLINT_CONFIG_FILE_PATTERN = /^eslint\.config\./;

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

// The extension arrays live in `src/globs.ts` next to the glob patterns they
// mirror, and are re-exported here under the names the lint CLI uses:
//
// - LINTABLE_EXTENSIONS (GLOB_LINTABLE_EXTENSIONS): every extension the preset
//   lints by default — TS/JS family plus JSONC, YAML, TOML, Markdown and Lua.
//   A consumer that disables one of these features never caches those files, so
//   they count as dirty every run and mildly inflate the worker count. That is
//   harmless (a worker of cheap non-TS files never builds a TS program) and
//   preferable to undercounting, so there is no knob.
// - TYPE_AWARE_EXTENSIONS (GLOB_SRC_EXTENSIONS): the TS/JS-family subset the
//   type-aware (`--type-aware=only`) config lints and the only files that ever
//   enter the type-aware cache, so the typed pass sizes from just this subset.
export {
	GLOB_LINTABLE_EXTENSIONS as LINTABLE_EXTENSIONS,
	GLOB_SRC_EXTENSIONS as TYPE_AWARE_EXTENSIONS,
} from "../globs.ts";

/**
 * Glob patterns whose modification invalidates every ESLint cache. A bare
 * `*` never crosses a path separator, so single-segment patterns (for example
 * `*.config.*` or the lockfiles) only match root-level files, while
 * `**` patterns match at any depth.
 */
export const CACHE_BUST_PATTERNS = [
	"eslint.config.*",
	"*.config.*",
	"**/tsconfig*.json",
	".oxlintrc*",
	".prettierrc*",
	"pnpm-lock.yaml",
	"package-lock.json",
	"yarn.lock",
	"bun.lock",
	"bun.lockb",
] as const;

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
