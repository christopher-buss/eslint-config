// cspell:words lintable typeaware
import type { TypeAwareMode } from "./types.ts";

/** Default number of files a single ESLint worker should handle. */
export const DEFAULT_FILES_PER_WORKER = 350;

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

/** File extensions ESLint/oxlint are expected to lint. */
export const LINTABLE_EXTENSIONS = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"] as const;

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
