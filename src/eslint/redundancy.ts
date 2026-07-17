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
	ValidateSubOptionsFromTable,
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
 * The options keys whose override sites are validated, derived from the chain
 * table so the exhaustiveness type test also guards the wiring itself.
 */
export type ValidatedOverrideKeys = "test" | keyof OverrideSiteChains;

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
 * Disabled together with the rest of the check via `redundancyCheck: false`.
 *
 * @template C - The literal user-config tuple.
 * @template O - The factory options type (selects the defaults variant).
 */
export type ValidateUserConfigs<C extends ReadonlyArray<unknown>, O> = O extends {
	redundancyCheck: false;
}
	? unknown
	: ValidateUserConfigsAgainst<C, MainChain, VariantKeyOf<O>>;

type MainChain = [MainRuleDefaults];

/** Scope for opt-in features that extend the main TS scope (naming, ...). */
type FeatureChain = [SourceFeatureRuleDefaults, MainRuleDefaults];

type ReactChain = [ReactRuleDefaults, SourceFeatureRuleDefaults, MainRuleDefaults];

/** Single source of truth: which sub-config validates against which chain. */
interface OverrideSiteChains {
	e18e: MainChain;
	eslintPlugin: FeatureChain;
	javascript: MainChain;
	jsonc: [JsoncRuleDefaults];
	markdown: [MarkdownRuleDefaults];
	naming: FeatureChain;
	react: ReactChain;
	roblox: MainChain;
	toml: [TomlRuleDefaults];
	typescript: MainChain;
	yaml: [YamlRuleDefaults];
}

type TestChain = [TestRuleDefaults, SourceFeatureRuleDefaults, MainRuleDefaults];

type ValidateOptionsWith<O, VK extends VariantKey> = ValidateSite<O, "rules", MainChain, VK> &
	ValidateSubOptionsFromTable<O, OverrideSiteChains, VK> &
	ValidateTestOption<O, TestChain, VK>;
