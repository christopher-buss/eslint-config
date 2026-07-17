/**
 * Wires the redundant-override check into the oxlint factory options.
 *
 * Mirrors `src/eslint/redundancy.ts` against the oxlint defaults maps, with
 * one semantic difference: oxlint replaces rule entries wholesale, so a bare
 * severity is only redundant against a default that also carries no options
 * (`RetainsOptions = false`). Disabled entirely via `redundancyCheck: false`.
 */
import type { ValidateRulesAgainst, VariantKey, VariantKeyOf } from "../redundancy.ts";
import type {
	OxlintMainRuleDefaults,
	OxlintReactRuleDefaults,
	OxlintSourceFeatureRuleDefaults,
	OxlintTestRuleDefaults,
} from "./typegen-defaults.d.ts";

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
 * defaults. `files`-scoped fragments pass through unchecked — glob scoping
 * cannot be reasoned about at the type level.
 *
 * @template C - The literal fragment tuple.
 * @template O - The factory options type (selects the defaults variant).
 */
export type ValidateOxlintUserConfigs<C extends ReadonlyArray<unknown>, O> = {
	[I in keyof C]: C[I] & ValidateUserConfigItem<C[I], VariantKeyOf<O>>;
};

type MainChain = [OxlintMainRuleDefaults];

/** Scope for opt-in features that extend the main TS scope. */
type FeatureChain = [OxlintSourceFeatureRuleDefaults, OxlintMainRuleDefaults];

type ReactChain = [
	OxlintReactRuleDefaults,
	OxlintSourceFeatureRuleDefaults,
	OxlintMainRuleDefaults,
];

type Validate<
	R,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
> = ValidateRulesAgainst<R, Chain, VK, false>;

type ValidateSite<
	Site,
	Key extends string,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
> = Site extends Record<Key, infer R> ? Partial<Record<Key, Validate<R, Chain, VK>>> : unknown;

type ValidateSub<Sub, Chain extends ReadonlyArray<unknown>, VK extends VariantKey> = ValidateSite<
	Sub,
	"overrides",
	Chain,
	VK
> &
	ValidateSite<Sub, "overridesTypeAware", Chain, VK>;

type ValidateSubOption<
	O,
	Key extends string,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
> = O extends Record<Key, infer Sub> ? Partial<Record<Key, ValidateSub<Sub, Chain, VK>>> : unknown;

type TestChain = [OxlintTestRuleDefaults, OxlintSourceFeatureRuleDefaults, OxlintMainRuleDefaults];

type ValidateTest<O, VK extends VariantKey> = O extends { test: infer T }
	? {
			test?: (T extends { jest: infer J }
				? { jest?: ValidateSub<J, TestChain, VK> }
				: unknown) &
				(T extends { vitest: infer V }
					? { vitest?: ValidateSub<V, TestChain, VK> }
					: unknown) &
				ValidateSub<T, TestChain, VK>;
		}
	: unknown;

type ValidateOptionsWith<O, VK extends VariantKey> = ValidateSite<O, "rules", MainChain, VK> &
	ValidateSubOption<O, "e18e", MainChain, VK> &
	ValidateSubOption<O, "eslintPlugin", FeatureChain, VK> &
	ValidateSubOption<O, "javascript", MainChain, VK> &
	ValidateSubOption<O, "react", ReactChain, VK> &
	ValidateSubOption<O, "roblox", MainChain, VK> &
	ValidateSubOption<O, "typescript", MainChain, VK> &
	ValidateTest<O, VK>;

type ValidateUserConfigItem<Item, VK extends VariantKey> = Item extends { files: unknown }
	? unknown
	: Item extends { rules: infer R }
		? { rules?: Validate<R, MainChain, VK> }
		: unknown;
