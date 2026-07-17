/**
 * Oxlint-specific types.
 *
 * IMPORTANT: everything that references the optional `oxlint` peer dependency
 * must stay in this directory. Leaking these types into the shared or ESLint
 * type modules would make `dist/index.d.mts` depend on `oxlint`, breaking
 * ESLint-only consumers who do not install it.
 */
import type { DummyRuleMap, OxlintConfig, OxlintOverride, RuleCategories } from "oxlint";

import type { OptionsConfig } from "../eslint/types.ts";
import type { OxlintRules } from "./typegen";

/** Rule names implemented natively by oxlint. */
export type OxlintNativeRuleName = keyof DummyRuleMap;

/** Top-level oxlint `settings`. */
export type OxlintSettings = NonNullable<OxlintConfig["settings"]>;

/** Top-level oxlint linter `options` (typeAware, maxWarnings, ...). */
export type OxlintLinterOptions = NonNullable<OxlintConfig["options"]>;

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
	rules?: OxlintRules;

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

/**
 * Options accepted by the oxlint factory function.
 *
 * Combines oxlint config fields (`env`, `globals`, `rules`, ...) with the
 * shared preset options and the top-level linter `options` object.
 */
export type OxlintFactoryOptions = Omit<TypedOxlintConfigItem, "files"> &
	OxlintOptionsConfig & {
		/**
		 * Rule categories to enable at the top level.
		 *
		 * The preset enables its rules explicitly and disables every category by
		 * default, so oxlint's own category defaults do not fire on top of the
		 * curated set. Values here are merged over that default, so enabling one
		 * category leaves the rest off.
		 */
		categories?: RuleCategories;

		/**
		 * Top-level linter options emitted into the generated config
		 * (`typeAware`, `typeCheck`, `maxWarnings`, ...).
		 *
		 * `typeAware` defaults to `true` when `oxlint-tsgolint` is resolvable,
		 * so type-aware rules run without passing `--type-aware` on the CLI.
		 * CLI flags take precedence over these values.
		 */
		options?: OxlintLinterOptions;

		/**
		 * Enable oxlint's native `oxc/*` rules (correctness and performance
		 * checks with no ESLint equivalent). Defaults to `true`.
		 *
		 * These rules are oxlint-only, so consumers linting solely with ESLint
		 * see no effect from this option.
		 */
		oxc?: boolean;
	};

export type {
	OxlintNativeRuleOptions,
	OxlintRenamedJsPluginRuleOptions,
	OxlintRuleOptions,
	OxlintRules,
} from "./typegen";
export type {
	DummyRuleMap,
	ExternalPluginEntry,
	OxlintConfig,
	OxlintOverride,
	RuleCategories,
} from "oxlint";
