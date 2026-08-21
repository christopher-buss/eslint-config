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
	| "projectStructure"
	| "toml"
	| "yaml"
>;

/**
 * Options accepted by the oxlint factory function.
 *
 * Combines oxlint config fields (`env`, `globals`, `rules`, ...) with the
 * shared preset options and the top-level linter `options` object.
 */
export type OxlintFactoryOptions = {
	/**
	 * Rule categories to enable at the top level.
	 *
	 * The preset enables its rules explicitly and disables every category
	 * by default, so oxlint's own category defaults do not fire on top of
	 * the curated set. Values here are merged over that default, so
	 * enabling one category leaves the rest off.
	 */
	categories?: RuleCategories;

	/**
	 * The directory holding this config, normally `import.meta.dirname`.
	 *
	 * Oxlint matches `overrides[].files` against paths relative to the config
	 * that declares them, and nested configs replace their ancestors rather
	 * than merging. A relaxation anchored on a directory name — `scripts`,
	 * `tools`, `bin` — therefore cannot match from a config that already lives
	 * inside that directory, because the anchor segment is not part of the path
	 * being tested.
	 *
	 * Supplying this lets the factory emit an anchor-stripped variant alongside
	 * each such pattern. Omit it and those relaxations are silently inert in
	 * nested configs.
	 *
	 * Unlike ESLint, oxlint has no per-override base path to set instead:
	 * `basePath` is rejected outright by its schema, and the upstream
	 * equivalent is unresolved (oxc-project/oxc#24276).
	 */
	configDirectory?: string;

	/**
	 * Extra jsPlugins to load, or `false` to run oxlint with native rules
	 * only.
	 *
	 * With `false` the factory drops every rule that would run through a
	 * jsPlugin (spelling, the react and jest families, oxfmt formatting, ...),
	 * leaving oxlint with its Rust rules and — when enabled — the tsgolint
	 * type-aware ones. Pair it with `oxlint: "native"` in the ESLint factory,
	 * which keeps exactly those rules in ESLint.
	 *
	 * `oxlint-comments` is the one exception: it lints the `oxlint-disable`
	 * directives that native rules still need, ESLint cannot run it, and its
	 * rules visit each file once, so it stays loaded.
	 */
	jsPlugins?: false | NonNullable<TypedOxlintConfigItem["jsPlugins"]>;

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

	/**
	 * Warn about `overrides` entries oxlint cannot apply. Defaults to `true`.
	 *
	 * An override is authoritative: it applies at the scope its config option
	 * covers whether or not the preset enables the rule. A few cannot be
	 * honoured — a rule that needs type information oxlint has no jsPlugin
	 * route for, a plugin that is not installed, or one dropped by
	 * `jsPlugins: false` — and those are reported rather than discarded in
	 * silence.
	 */
	warnDroppedOverrides?: boolean;
} & Omit<TypedOxlintConfigItem, "files" | "jsPlugins"> &
	OxlintOptionsConfig;

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
