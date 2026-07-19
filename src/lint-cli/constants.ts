// cspell:words lintable typeaware undercounting
import type { TypeAwareMode } from "./types.ts";

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

/** ESLint cache file used when no type-aware mode is selected. */
export const CACHE_FILE_DEFAULT = ".eslintcache";

/** ESLint cache file used for `--type-aware=off` (syntactic-only) runs. */
export const CACHE_FILE_FAST = ".eslintcache-fast";

/** ESLint cache file used for `--type-aware=only` runs. */
export const CACHE_FILE_TYPE_AWARE = ".eslintcache-typeaware";

/** Every ESLint cache file the runner manages, cleared on a config change. */
export const ALL_CACHE_FILES = [
	CACHE_FILE_DEFAULT,
	CACHE_FILE_FAST,
	CACHE_FILE_TYPE_AWARE,
] as const;

/**
 * File extensions the preset lints by default. Covers the TS/JS family plus
 * JSONC (including package.json), YAML, TOML, Markdown and Lua, which the
 * ESLint config enables unless the consumer opts out (see the enable* gates in
 * `src/eslint/factory.ts`).
 *
 * Trade-off. When a consumer disables one of these features those files never
 * enter the ESLint cache, so they count as dirty every run and mildly inflate
 * the worker count. That is harmless (a worker of cheap non-TS files never
 * builds a TS program) and preferable to undercounting, so there is no knob.
 */
export const LINTABLE_EXTENSIONS = [
	"ts",
	"tsx",
	"mts",
	"cts",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"json",
	"jsonc",
	"json5",
	"yaml",
	"yml",
	"toml",
	"md",
	"lua",
] as const;

/**
 * The TS/JS-family extensions the type-aware (`--type-aware=only`) config
 * lints. Only these files ever enter the type-aware cache, so the typed pass
 * sizes its worker count from just this subset of the dirty set.
 */
export const TYPE_AWARE_EXTENSIONS = [
	"ts",
	"tsx",
	"mts",
	"cts",
	"js",
	"jsx",
	"mjs",
	"cjs",
] as const;

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
	const raw = environment["LINT_AFFECTED_BUST_THRESHOLD"];
	if (raw === undefined) {
		return AFFECTED_BUST_THRESHOLD;
	}

	const parsed = Number(raw.trim());
	if (!Number.isInteger(parsed) || parsed < 0) {
		return AFFECTED_BUST_THRESHOLD;
	}

	return parsed;
}

/**
 * Resolve the ESLint cache file for the given type-aware mode.
 *
 * @param mode - The active type-aware mode, if any.
 * @returns The cache file name for that mode.
 */
export function cacheFileForMode(mode: TypeAwareMode | undefined): string {
	if (mode === "off") {
		return CACHE_FILE_FAST;
	}

	if (mode === "only") {
		return CACHE_FILE_TYPE_AWARE;
	}

	return CACHE_FILE_DEFAULT;
}
