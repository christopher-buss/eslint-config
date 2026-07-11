/**
 * Oxlint-specific types.
 *
 * IMPORTANT: everything that references the optional `oxlint` peer dependency
 * must stay in this directory. Leaking these types into the shared or ESLint
 * type modules would make `dist/index.d.mts` depend on `oxlint`, breaking
 * ESLint-only consumers who do not install it.
 */
import type { Linter } from "eslint";
import type { DummyRuleMap, OxlintConfig, OxlintOverride } from "oxlint";

import type { OptionsConfig } from "../eslint/types.ts";
import type { Rules } from "../types.ts";

/** Rule names implemented natively by oxlint. */
export type OxlintNativeRuleName = keyof DummyRuleMap;

/** A rule map restricted to native oxlint rules. */
export type OxlintRules = Partial<Record<OxlintNativeRuleName, Linter.RuleEntry>>;

/** Top-level oxlint `settings`. */
export type OxlintSettings = NonNullable<OxlintConfig["settings"]>;

/** Built-in oxlint plugin names. */
export type OxlintPlugin = NonNullable<OxlintConfig["plugins"]>[number];

/**
 * A named oxlint config fragment produced by the config modules. The factory
 * merges fragments into `overrides`, hoists `settings` to the top level and
 * strips `name` (not supported by oxlint).
 */
export type TypedOxlintConfigItem = Omit<OxlintOverride, "rules"> & {
	/** A name for this config item, for debugging and tooling support. */
	name: string;

	/**
	 * An object containing the configured rules, using canonical oxlint rule
	 * names (native names or jsPlugin-prefixed names).
	 */
	rules?: Rules;

	/**
	 * Plugin-specific settings. The factory strips these from fragments and
	 * merges them into the top-level `settings` object, since oxlint only
	 * supports settings at the top level.
	 */
	settings?: OxlintSettings;
};

/**
 * Options accepted by the oxlint factory.
 *
 * Oxlint can only lint JS/TS files, so the JSON, YAML, TOML, Markdown and
 * pnpm-related options are omitted, along with ESLint-only options.
 */
export type OxlintOptionsConfig = Omit<
	OptionsConfig,
	| "autoRenamePlugins"
	| "e18e"
	| "flawless"
	| "jsonc"
	| "markdown"
	| "namedConfigs"
	| "naming"
	| "oxlint"
	| "pnpm"
	| "toml"
	| "yaml"
>;

export type { DummyRuleMap, ExternalPluginEntry, OxlintConfig, OxlintOverride } from "oxlint";
