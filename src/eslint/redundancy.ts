/**
 * Wires the redundant-override check into the ESLint factory options.
 *
 * `ValidateOptions<O>` is intersected with the inferred options object; every
 * override site is mapped against the generated defaults for its scope, so a
 * rule entry that re-states the preset default fails to typecheck with a
 * `RedundantRuleError` message. Disabled entirely via `redundancyCheck: false`.
 */
import type { ValidateRulesAgainst, VariantKey, VariantKeyOf } from "../redundancy.ts";
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
 * Validate the rest-argument user configs against the main-scope defaults.
 * Promises, composers and `files`-scoped items pass through unchecked — glob
 * scoping cannot be reasoned about at the type level.
 *
 * @template C - The literal user-config tuple.
 * @template O - The factory options type (selects the defaults variant).
 */
export type ValidateUserConfigs<C extends ReadonlyArray<unknown>, O> = {
	[I in keyof C]: C[I] extends ReadonlyArray<unknown>
		? { [J in keyof C[I]]: C[I][J] & ValidateUserConfigItem<C[I][J], VariantKeyOf<O>> }
		: C[I] & ValidateUserConfigItem<C[I], VariantKeyOf<O>>;
};

/**
 * Redundant-override validation for the factory options object. Resolves to
 * `unknown` (a no-op under intersection) when the check is disabled.
 *
 * @template O - The factory options type.
 */
export type ValidateOptions<O> = O extends { redundancyCheck: false }
	? unknown
	: ValidateOptionsWith<O, VariantKeyOf<O>>;

type MainChain = [MainRuleDefaults];

type ValidateUserConfigItem<Item, VK extends VariantKey> = Item extends { files: unknown }
	? unknown
	: Item extends { rules: infer R }
		? { rules?: ValidateRulesAgainst<R, MainChain, VK> }
		: unknown;

/** Scope for opt-in features that extend the main TS scope (naming, ...). */
type FeatureChain = [SourceFeatureRuleDefaults, MainRuleDefaults];

type ReactChain = [ReactRuleDefaults, SourceFeatureRuleDefaults, MainRuleDefaults];

type ValidateSite<
	Site,
	Key extends string,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
> =
	Site extends Record<Key, infer R>
		? Partial<Record<Key, ValidateRulesAgainst<R, Chain, VK>>>
		: unknown;

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

type TestChain = [TestRuleDefaults, SourceFeatureRuleDefaults, MainRuleDefaults];

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
	ValidateSubOption<O, "jsonc", [JsoncRuleDefaults], VK> &
	ValidateSubOption<O, "markdown", [MarkdownRuleDefaults], VK> &
	ValidateSubOption<O, "naming", FeatureChain, VK> &
	ValidateSubOption<O, "react", ReactChain, VK> &
	ValidateSubOption<O, "roblox", MainChain, VK> &
	ValidateSubOption<O, "toml", [TomlRuleDefaults], VK> &
	ValidateSubOption<O, "typescript", MainChain, VK> &
	ValidateSubOption<O, "yaml", [YamlRuleDefaults], VK> &
	ValidateTest<O, VK>;
