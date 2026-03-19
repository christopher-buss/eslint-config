import type { DummyRuleMap } from "oxlint";

import type { OptionsConfig } from "../eslint/index.ts";

export interface OxlintOptions {
	isInEditor?: boolean;
	jsdoc?: boolean;
	roblox?: boolean;
	root?: Array<string>;
	rules?: DummyRuleMap;
	stylistic?: boolean;
	type?: "app" | "game" | "package";
	vitest?: boolean;
}

export type OxlintPlugin =
	| "eslint"
	| "import"
	| "jest"
	| "jsdoc"
	| "jsx-a11y"
	| "nextjs"
	| "node"
	| "oxc"
	| "promise"
	| "react"
	| "react-perf"
	| "typescript"
	| "unicorn"
	| "vitest"
	| "vue";

export type * from "../types.ts";

/**
 * Oxlint only supports JS/TS files for jsPlugin rules. File types like
 * CSS, HTML, GraphQL, JSON, YAML, and TOML are handled by ESLint instead.
 */
export interface OxlintOptionsFormatters {
	/** Enable formatting support for Markdown. */
	markdown?: boolean;
}

/**
 * Oxlint can't process JSONC, YAML, TOML, or Markdown files — those are
 * handled by ESLint. This type omits the unsupported file-type options.
 */
export type OxlintOptionsConfig = Omit<
	OptionsConfig,
	| "autoRenamePlugins"
	| "flawless"
	| "jsonc"
	| "markdown"
	| "namedConfigs"
	| "oxlint"
	| "toml"
	| "yaml"
>;

export type { OxlintOverride } from "oxlint";
