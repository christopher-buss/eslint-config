/**
 * Wires the redundant-override check into the ESLint factory options.
 *
 * `ValidateOptions<O>` is intersected with the inferred options object; every
 * override site is mapped against the generated defaults for its scope, so a
 * rule entry that re-states the preset default fails to typecheck with a
 * `RedundantRuleError` message. Disabled entirely via `redundancyCheck: false`.
 */
import type {
	ValidateSite,
	ValidateSubOption,
	ValidateTestOption,
	ValidateUserConfigsAgainst,
	VariantKey,
	VariantKeyOf,
} from "../redundancy.ts";
import type {
	JsoncRuleDefaults,
	MainRuleDefaults,
	MarkdownRuleDefaults,
	ReactRuleDefaults,
	SourceFeatureRuleDefaults,
	TestRuleDefaults,
	TomlRuleDefaults,
	YamlRuleDefaults,
} from "../typegen-defaults.d.ts";

/**
 * The options keys whose override sites are validated. Exported so a type test
 * can assert it stays exhaustive over the override-bearing keys of
 * `OptionsConfig`.
 */
export type ValidatedOverrideKeys =
	| "e18e"
	| "eslintPlugin"
	| "javascript"
	| "jsonc"
	| "markdown"
	| "naming"
	| "react"
	| "roblox"
	| "test"
	| "toml"
	| "typescript"
	| "yaml";

/**
 * Redundant-override validation for the factory options object. Resolves to
 * `unknown` (a no-op under intersection) when the check is disabled.
 *
 * @template O - The factory options type.
 */
export type ValidateOptions<O> = O extends { redundancyCheck: false }
	? unknown
	: ValidateOptionsWith<O, VariantKeyOf<O>>;

/**
 * Validate the rest-argument user configs against the main-scope defaults.
 *
 * @template C - The literal user-config tuple.
 * @template O - The factory options type (selects the defaults variant).
 */
export type ValidateUserConfigs<C extends ReadonlyArray<unknown>, O> = ValidateUserConfigsAgainst<
	C,
	MainChain,
	VariantKeyOf<O>
>;

type MainChain = [MainRuleDefaults];

/** Scope for opt-in features that extend the main TS scope (naming, ...). */
type FeatureChain = [SourceFeatureRuleDefaults, MainRuleDefaults];

type ReactChain = [ReactRuleDefaults, SourceFeatureRuleDefaults, MainRuleDefaults];

type TestChain = [TestRuleDefaults, SourceFeatureRuleDefaults, MainRuleDefaults];

type ValidateOptionsWith<O, VK extends VariantKey> = ValidateSite<O, "rules", MainChain, VK> &
	ValidateSubOption<O, "e18e", MainChain, VK> &
	ValidateSubOption<O, "eslintPlugin", FeatureChain, VK> &
	ValidateSubOption<O, "javascript", MainChain, VK> &
	ValidateSubOption<O, "jsonc", [JsoncRuleDefaults], VK> &
	ValidateSubOption<O, "markdown", [MarkdownRuleDefaults], VK> &
	ValidateSubOption<O, "naming", FeatureChain, VK> &
	ValidateSubOption<O, "react", ReactChain, VK> &
	ValidateSubOption<O, "roblox", MainChain, VK> &
	ValidateSubOption<O, "toml", [TomlRuleDefaults], VK> &
	ValidateSubOption<O, "typescript", MainChain, VK> &
	ValidateSubOption<O, "yaml", [YamlRuleDefaults], VK> &
	ValidateTestOption<O, TestChain, VK>;
