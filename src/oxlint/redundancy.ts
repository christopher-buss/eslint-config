/**
 * Wires the redundant-override check into the oxlint factory options.
 *
 * Mirrors `src/eslint/redundancy.ts` against the oxlint defaults maps, with
 * one semantic difference: oxlint replaces rule entries wholesale, so a bare
 * severity is only redundant against a default that also carries no options
 * (`RetainsOptions = false`). Disabled entirely via `redundancyCheck: false`.
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
	OxlintMainRuleDefaults,
	OxlintReactRuleDefaults,
	OxlintSourceFeatureRuleDefaults,
	OxlintTestRuleDefaults,
} from "./typegen-defaults.d.ts";

/**
 * The options keys whose override sites are validated. Exported so a type test
 * can assert it stays exhaustive over the override-bearing keys of
 * `OxlintOptionsConfig`.
 */
export type OxlintValidatedOverrideKeys =
	| "e18e"
	| "eslintPlugin"
	| "javascript"
	| "react"
	| "roblox"
	| "test"
	| "typescript";

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

/**
 * Validate the rest-argument oxlint config fragments against the main-scope
 * defaults. Fragments always carry `files` globs, so in practice they pass
 * through unchecked — glob scoping cannot be reasoned about at the type level.
 *
 * @template C - The literal fragment tuple.
 * @template O - The factory options type (selects the defaults variant).
 */
export type ValidateOxlintUserConfigs<
	C extends ReadonlyArray<unknown>,
	O,
> = ValidateUserConfigsAgainst<C, MainChain, VariantKeyOf<O>, false>;

type MainChain = [OxlintMainRuleDefaults];

/** Scope for opt-in features that extend the main TS scope. */
type FeatureChain = [OxlintSourceFeatureRuleDefaults, OxlintMainRuleDefaults];

type ReactChain = [
	OxlintReactRuleDefaults,
	OxlintSourceFeatureRuleDefaults,
	OxlintMainRuleDefaults,
];

type TestChain = [OxlintTestRuleDefaults, OxlintSourceFeatureRuleDefaults, OxlintMainRuleDefaults];

type ValidateOptionsWith<O, VK extends VariantKey> = ValidateSite<
	O,
	"rules",
	MainChain,
	VK,
	false
> &
	ValidateSubOption<O, "e18e", MainChain, VK, false> &
	ValidateSubOption<O, "eslintPlugin", FeatureChain, VK, false> &
	ValidateSubOption<O, "javascript", MainChain, VK, false> &
	ValidateSubOption<O, "react", ReactChain, VK, false> &
	ValidateSubOption<O, "roblox", MainChain, VK, false> &
	ValidateSubOption<O, "typescript", MainChain, VK, false> &
	ValidateTestOption<O, TestChain, VK, false>;
