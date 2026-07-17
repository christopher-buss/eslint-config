/**
 * Wires the redundant-override check into the oxlint factory options.
 *
 * Mirrors `src/eslint/redundancy.ts` against the oxlint defaults maps, with
 * one semantic difference: oxlint replaces rule entries wholesale, so a bare
 * severity is only redundant against a default that also carries no options
 * (`RetainsOptions = false`). Disabled entirely via `redundancyCheck: false`.
 *
 * Rest-argument fragments are not validated at all: `OxlintOverride.files` is
 * required, so every fragment is files-scoped and glob scoping cannot be
 * reasoned about at the type level.
 */
import type {
	ValidateSite,
	ValidateSubOptionsFromTable,
	ValidateTestOption,
	VariantKey,
	VariantKeyOf,
} from "../redundancy.ts";
import type {
	OxlintMainRuleDefaults,
	OxlintReactRuleDefaults,
	OxlintSourceFeatureRuleDefaults,
	OxlintTestRuleDefaults,
} from "./typegen-defaults.d.ts";

/**
 * The options keys whose override sites are validated, derived from the chain
 * table so the exhaustiveness type test also guards the wiring itself.
 */
export type OxlintValidatedOverrideKeys = "test" | keyof OverrideSiteChains;

/**
 * Redundant-override validation for the oxlint factory options object.
 * Resolves to `unknown` (a no-op under intersection) when the check is
 * disabled.
 *
 * @template O - The factory options type.
 */
export type ValidateOxlintOptions<O> = O extends { redundancyCheck: false }
	? unknown
	: ValidateOptionsWith<O, VariantKeyOf<O>>;

type MainChain = [OxlintMainRuleDefaults];

/** Scope for opt-in features that extend the main TS scope. */
type FeatureChain = [OxlintSourceFeatureRuleDefaults, OxlintMainRuleDefaults];

type ReactChain = [
	OxlintReactRuleDefaults,
	OxlintSourceFeatureRuleDefaults,
	OxlintMainRuleDefaults,
];

/** Single source of truth: which sub-config validates against which chain. */
interface OverrideSiteChains {
	e18e: MainChain;
	eslintPlugin: FeatureChain;
	javascript: MainChain;
	react: ReactChain;
	roblox: MainChain;
	typescript: MainChain;
}

type TestChain = [OxlintTestRuleDefaults, OxlintSourceFeatureRuleDefaults, OxlintMainRuleDefaults];

type ValidateOptionsWith<O, VK extends VariantKey> = ValidateSite<
	O,
	"rules",
	MainChain,
	VK,
	false
> &
	ValidateSubOptionsFromTable<O, OverrideSiteChains, VK, false> &
	ValidateTestOption<O, TestChain, VK, false>;
