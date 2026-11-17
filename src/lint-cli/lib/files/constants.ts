// cspell:words lintable extensionless jakefile tfstate
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
	".oxfmtrc*",
	"oxfmt.config.*",
	".prettierrc*",
	"pnpm-lock.yaml",
	"package-lock.json",
	"yarn.lock",
	"bun.lock",
	"bun.lockb",
] as const;

/**
 * Every file extension oxfmt formats, without the dot. Oxfmt matches them
 * case-sensitively (`a.TS` is skipped). One entry has two parts
 * (`tfstate.backup`).
 *
 * Oxfmt keeps this list inside its native binary and does not export it, so it
 * was read off the installed oxfmt 0.78.0 by running `oxfmt --check x.<ext>`
 * once per candidate extension and keeping the ones it did not answer with
 * "Expected at least one target file". The candidates were the extensions its
 * docs name per language (JS, TS, JSON, CSS, HTML, Vue, Markdown, YAML, TOML,
 * GraphQL, Handlebars, MJML) plus their Linguist aliases. Svelte and Astro are
 * absent: oxfmt skips them unless a plugin is configured. Re-probe when oxfmt
 * is bumped.
 */
// cspell:disable
export const OXFMT_EXTENSIONS = [
	// JS / TS
	"_js",
	"bones",
	"cjs",
	"cts",
	"es",
	"es6",
	"gs",
	"jake",
	"javascript",
	"js",
	"jsb",
	"jscad",
	"jsfl",
	"jslib",
	"jsm",
	"jspre",
	"jss",
	"jsx",
	"mjs",
	"mts",
	"njs",
	"pac",
	"sjs",
	"ssjs",
	"ts",
	"tsx",
	"xsjs",
	"xsjslib",
	// JSON
	"4DForm",
	"4DProject",
	"avsc",
	"code-snippets",
	"code-workspace",
	"geojson",
	"gltf",
	"har",
	"ice",
	"importmap",
	"JSON-tmLanguage",
	"json",
	"json5",
	"jsonc",
	"mcmeta",
	"sublime_metrics",
	"sublime_session",
	"sublime-build",
	"sublime-commands",
	"sublime-completions",
	"sublime-keymap",
	"sublime-macro",
	"sublime-menu",
	"sublime-mousemap",
	"sublime-project",
	"sublime-settings",
	"sublime-theme",
	"sublime-workspace",
	"tfstate",
	"tfstate.backup",
	"topojson",
	"webapp",
	"webmanifest",
	"yy",
	"yyp",
	// CSS
	"css",
	"less",
	"pcss",
	"postcss",
	"scss",
	"wxss",
	// HTML / Vue / templates
	"handlebars",
	"hbs",
	"hta",
	"htm",
	"html",
	"inc",
	"mjml",
	"vue",
	"xht",
	"xhtml",
	// Markdown
	"livemd",
	"markdown",
	"md",
	"mdown",
	"mdwn",
	"mdx",
	"mkd",
	"mkdn",
	"mkdown",
	"ronn",
	"scd",
	"workbook",
	// YAML
	"mir",
	"reek",
	"rviz",
	"sublime-syntax",
	"syntax",
	"yaml",
	"yaml-tmlanguage",
	"yml",
	// TOML / GraphQL
	"gql",
	"graphql",
	"toml",
] as const;
// cspell:enable

/**
 * Basenames oxfmt formats although their extension is not in
 * {@link OXFMT_EXTENSIONS}, found by the same probe. Extensionless names and
 * dotfiles (`.babelrc`, `Jakefile`) are kept as candidates without a list,
 * since oxfmt matches many of them by name.
 */
export const OXFMT_FILENAMES = ["CITATION.cff", "contents.lr", "glide.lock", "pixi.lock"] as const;
