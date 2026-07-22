// cspell:words lintable
/** Matches a flat-config entry-point basename (`eslint.config.*`). */
export const ESLINT_CONFIG_FILE_PATTERN = /^eslint\.config\./;

// The extension arrays live in `src/globs.ts` next to the glob patterns they
// mirror, and are re-exported here under the names the lint CLI uses:
//
// - LINTABLE_EXTENSIONS (GLOB_LINTABLE_EXTENSIONS): every extension the preset
//   lints by default — TS/JS family plus JSONC, YAML, TOML, Markdown and Lua.
//   A consumer that disables one of these features never caches those files, so
//   they would count as dirty every run; `resolveIgnoredFiles` drops them,
//   since ESLint reports a file that no config matches as ignored.
// - TYPE_AWARE_EXTENSIONS (GLOB_SRC_EXTENSIONS): the TS/JS-family subset the
//   type-aware (`--type-aware=only`) config lints and the only files that ever
//   enter the type-aware cache, so the typed pass sizes from just this subset.
export {
	GLOB_LINTABLE_EXTENSIONS as LINTABLE_EXTENSIONS,
	GLOB_SRC_EXTENSIONS as TYPE_AWARE_EXTENSIONS,
} from "../../../globs.ts";

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
