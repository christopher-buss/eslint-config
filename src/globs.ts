export const GLOB_ROOT = [
	"*",
	"packages/*/*",
	"apps/*/*",
	"libs/*/*",
	"packages/*/*/*",
	"apps/*/*/*",
	"libs/*/*/*",
];

export const GLOB_ROOT_SRC = [
	"*.?([cm])[jt]s?(x)",
	"packages/*/*.?([cm])[jt]s?(x)",
	"apps/*/*.?([cm])[jt]s?(x)",
	"libs/*/*.?([cm])[jt]s?(x)",
	"packages/*/*/*.?([cm])[jt]s?(x)",
	"apps/*/*/*.?([cm])[jt]s?(x)",
	"libs/*/*/*.?([cm])[jt]s?(x)",
];

export const GLOB_SRC_EXT = "?([cm])[jt]s?(x)";
export const GLOB_SRC = "**/*.?([cm])[jt]s?(x)";

export const GLOB_LUA = "**/*.lua?(u)";

export const GLOB_JS = "**/*.?([cm])js";
export const GLOB_JSX = "**/*.?([cm])jsx";

export const GLOB_TS = "**/*.?([cm])ts";
export const GLOB_TSX = "**/*.?([cm])tsx";
export const GLOB_DTS = "**/*.d.?([cm])ts";

export const GLOB_STYLE = "**/*.{c,le,sc}ss";
export const GLOB_CSS = "**/*.css";
export const GLOB_POSTCSS = "**/*.{p,post}css";
export const GLOB_LESS = "**/*.less";
export const GLOB_SCSS = "**/*.scss";

export const GLOB_JSON = "**/*.json";
export const GLOB_JSON5 = "**/*.json5";
export const GLOB_JSONC = "**/*.jsonc";
export const GLOB_ALL_JSON = "**/*.json?(5|c)";

export const GLOB_MARKDOWN = "**/*.md";
export const GLOB_MARKDOWN_IN_MARKDOWN = "**/*.md/*.md";
export const GLOB_MARKDOWN_CODE: string = `${GLOB_MARKDOWN}/${GLOB_SRC}`;
export const GLOB_MARKDOWN_BLOCKS: string = `${GLOB_MARKDOWN}/**/*.{${GLOB_SRC_EXT},json,json5,jsonc,y?(a)ml,{c,le,sc}ss,htm?(l),toml,{g,graph}ql,lua?(u)}`;

export const GLOB_YAML = "**/*.y?(a)ml";
export const GLOB_TOML = "**/*.toml";
export const GLOB_HTML = "**/*.htm?(l)";
export const GLOB_XML = "**/*.xml";
export const GLOB_GRAPHQL = "**/*.{g,graph}ql";

export const GLOB_TESTS: Array<string> = [
	`**/__tests__/**/*.${GLOB_SRC_EXT}`,
	`**/*.spec.${GLOB_SRC_EXT}`,
	`**/*.test.${GLOB_SRC_EXT}`,
	`**/*.bench.${GLOB_SRC_EXT}`,
	`**/*.benchmark.${GLOB_SRC_EXT}`,
];

export const GLOB_BUILD_TOOLS: Array<string> = [
	"**/.husky/**/*",
	`**/config/${GLOB_SRC}`,
	`**/*config.${GLOB_SRC_EXT}`,
	`**/*config.*.${GLOB_SRC_EXT}`,
	`**/build/${GLOB_SRC}`,
	`**/tools/${GLOB_SRC}`,
	`**/setup/${GLOB_SRC}`,
	`**/dev/${GLOB_SRC}`,
	`**/tasks/${GLOB_SRC}`,
	"**/.github/scripts/**/*",
];

export const GLOB_ALL_SRC = [
	GLOB_SRC,
	GLOB_STYLE,
	GLOB_JSON,
	GLOB_JSON5,
	GLOB_MARKDOWN,
	GLOB_YAML,
	GLOB_HTML,
];

export const GLOB_EXCLUDE = [
	"**/.pnpm-store",
	"**/bun.lockb",
	"**/dist",
	"**/node_modules",
	"**/package-lock.json",
	"**/pnpm-lock.yaml",
	"**/yarn.lock",

	"**/.cache",
	"**/.changeset",
	"**/.claude",
	"**/.history",
	"**/.idea",
	"**/.next",
	"**/.nuxt",
	"**/.output",
	"**/.svelte-kit",
	"**/.temp",
	"**/.tmp",
	"**/.vercel",
	"**/.vite-inspect",
	"**/.vitepress/cache",
	"**/.worktree",
	"**/.yarn",
	"**/coverage",
	"**/out",
	"**/output",
	"**/temp",
	"**/tmp",
	"**/vite.config.*.timestamp-*",

	"**/*.min.*",
	"**/CHANGELOG*.md",
	"**/LICENSE*",
	"**/__snapshots__",
	"**/auto-import?(s).d.ts",
	"**/components.d.ts",

	"**/roblox.yml",
];
