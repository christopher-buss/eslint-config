/**
 * Type-level detection of redundant rule overrides.
 *
 * An override is redundant when it re-states what the preset already resolves
 * to by default. Redundant entries are mapped to {@link RedundantRuleError} so
 * the mismatch surfaces as a readable TypeScript error at the offending line.
 *
 * Comparison semantics follow ESLint flat-config merging:
 *
 * - A bare severity (or single-element tuple) keeps the previous entry's
 *   options, so it is redundant whenever the severity alone matches.
 * - A tuple with options is redundant only when severity and options are
 *   structurally identical to the default entry.
 *
 * Defaults are provided by the generated defaults maps (`pnpm gen`), keyed per
 * preset variant (`type` x `roblox`). Rules whose default is identical across
 * variants use the `"*"` key.
 *
 * The per-factory wiring (which override site validates against which chain of
 * defaults maps) lives in `src/eslint/redundancy.ts` and
 * `src/oxlint/redundancy.ts`; the factory-agnostic machinery lives here.
 */

/**
 * Whether a user-written rule entry is redundant against the preset default
 * entry for the same rule.
 *
 * `RetainsOptions` mirrors the linter's merge semantics for bare-severity
 * entries: ESLint keeps the previous entry's options (`true`), so a matching
 * severity alone is redundant; oxlint replaces the whole entry (`false`), so a
 * bare severity is only redundant against a default that also has no options.
 *
 * @template UserEntry - The user-written rule entry.
 * @template DefaultEntry - The preset default entry.
 * @template RetainsOptions - Whether a bare severity keeps previous options.
 */
export type IsRedundantEntry<UserEntry, DefaultEntry, RetainsOptions extends boolean = true> =
	IsSeverityOnly<UserEntry> extends true
		? RetainsOptions extends true
			? Equal<SeverityOf<UserEntry>, SeverityOf<DefaultEntry>>
			: IsSeverityOnly<DefaultEntry> extends true
				? Equal<SeverityOf<UserEntry>, SeverityOf<DefaultEntry>>
				: false
		: DefaultEntry extends { severityOnly: unknown }
			? false
			: Equal<NormalizeEntry<UserEntry>, NormalizeEntry<DefaultEntry>>;

/**
 * Generated-map marker for a default whose real entry carries options that
 * could not be captured (environment-dependent or unserializable). Distinct
 * from a truly bare severity: under wholesale-replacement semantics
 * (`RetainsOptions = false`) a bare user severity over such a default strips
 * real options and is therefore never redundant.
 *
 * @template S - The default's severity.
 */
export interface DroppedOptionsDefault<S extends string> {
	severityOnly: S;
}

/**
 * Brand carried by redundant rule entries. Being an object type, it never
 * overlaps with actual rule entries, so assignment fails with the message
 * visible in the diagnostic.
 *
 * @template Message - The human-readable diagnostic message.
 */
export interface RedundantRuleError<Message extends string> {
	"redundant override": Message;
}

/**
 * Preset variant axes that can change a rule's default: project `type` and
 * whether `roblox` mode is enabled (`std` = roblox disabled).
 */
export type VariantKey = "game_roblox" | "game_std" | "package_roblox" | "package_std";

/**
 * Resolve the variant key(s) selected by the factory options. Non-literal
 * `type`/`roblox` values widen to a union, which disables variant-specific
 * checks (never invariant ones) rather than risking false positives.
 *
 * @template O - The factory options type.
 */
export type VariantKeyOf<O> = `${TypeAxis<O>}_${RobloxAxis<O>}` & VariantKey;

/**
 * Map a user rules record against an ordered chain of generated defaults maps
 * (most specific scope first), branding redundant entries with
 * {@link RedundantRuleError}. Unknown rules and rules without a resolvable
 * default pass through untouched.
 *
 * @template R - The user-written rules record.
 * @template Chain - Ordered defaults maps, most specific scope first.
 * @template VK - The variant key(s) selected by the factory options.
 * @template RetainsOptions - Whether a bare severity keeps previous options.
 */
export type ValidateRulesAgainst<
	R,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
	RetainsOptions extends boolean = true,
> = {
	[K in keyof R]: ValidateEntry<K & string, R[K], ChainDefault<K, Chain, VK>, RetainsOptions>;
};

/**
 * Validate one rules-bearing property (`rules`, `overrides`,
 * `overridesTypeAware`) of an options object against a defaults chain.
 *
 * @template Site - The object that may carry the property.
 * @template Key - The property name to validate.
 * @template Chain - Ordered defaults maps, most specific scope first.
 * @template VK - The variant key(s) selected by the factory options.
 * @template RetainsOptions - Whether a bare severity keeps previous options.
 */
export type ValidateSite<
	Site,
	Key extends string,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
	RetainsOptions extends boolean = true,
> =
	Site extends Record<Key, infer R>
		? Partial<Record<Key, ValidateRulesAgainst<R, Chain, VK, RetainsOptions>>>
		: unknown;

/**
 * Validate the `overrides` and `overridesTypeAware` sites of one sub-config
 * object.
 *
 * @template Sub - The sub-config object.
 * @template Chain - Ordered defaults maps, most specific scope first.
 * @template VK - The variant key(s) selected by the factory options.
 * @template RetainsOptions - Whether a bare severity keeps previous options.
 */
export type ValidateSub<
	Sub,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
	RetainsOptions extends boolean = true,
> = ValidateSite<Sub, "overrides", Chain, VK, RetainsOptions> &
	ValidateSite<Sub, "overridesTypeAware", Chain, VK, RetainsOptions>;

/**
 * Validate the sub-config stored under `Key` of the options object, when
 * present.
 *
 * @template O - The factory options type.
 * @template Key - The sub-config option name.
 * @template Chain - Ordered defaults maps, most specific scope first.
 * @template VK - The variant key(s) selected by the factory options.
 * @template RetainsOptions - Whether a bare severity keeps previous options.
 */
export type ValidateSubOption<
	O,
	Key extends string,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
	RetainsOptions extends boolean = true,
> =
	O extends Record<Key, infer Sub>
		? Partial<Record<Key, ValidateSub<Sub, Chain, VK, RetainsOptions>>>
		: unknown;

/**
 * Build the intersection of {@link ValidateSubOption} for every key of a
 * chain table (`option name → defaults chain`), so the validated key set and
 * the wiring derive from one source.
 *
 * @template O - The factory options type.
 * @template Table - Record mapping sub-config option names to their chains.
 * @template VK - The variant key(s) selected by the factory options.
 * @template RetainsOptions - Whether a bare severity keeps previous options.
 */
export type ValidateSubOptionsFromTable<
	O,
	Table,
	VK extends VariantKey,
	RetainsOptions extends boolean = true,
> = UnionToIntersection<
	{
		// The `object &` keeps absent-key members (`unknown`) from absorbing
		// the branded members when the mapped values form a union below.
		[K in keyof Table]: object &
			ValidateSubOption<
				O,
				K & string,
				Extract<Table[K], ReadonlyArray<unknown>>,
				VK,
				RetainsOptions
			>;
	}[keyof Table]
>;

/**
 * Validate the `test` option, including its nested `jest` and `vitest`
 * sub-configs, against the test-scope defaults chain.
 *
 * @template O - The factory options type.
 * @template Chain - Ordered test-scope defaults maps.
 * @template VK - The variant key(s) selected by the factory options.
 * @template RetainsOptions - Whether a bare severity keeps previous options.
 */
export type ValidateTestOption<
	O,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
	RetainsOptions extends boolean = true,
> = O extends { test: infer T }
	? {
			test?: (T extends { jest: infer J }
				? { jest?: ValidateSub<J, Chain, VK, RetainsOptions> }
				: unknown) &
				(T extends { vitest: infer V }
					? { vitest?: ValidateSub<V, Chain, VK, RetainsOptions> }
					: unknown) &
				ValidateSub<T, Chain, VK, RetainsOptions>;
		}
	: unknown;

/**
 * Validate rest-argument user configs against the main-scope defaults chain.
 * Promises, composers and `files`-scoped items pass through unchecked — glob
 * scoping cannot be reasoned about at the type level.
 *
 * @template C - The literal user-config tuple.
 * @template Chain - Ordered main-scope defaults maps.
 * @template VK - The variant key(s) selected by the factory options.
 * @template RetainsOptions - Whether a bare severity keeps previous options.
 */
export type ValidateUserConfigsAgainst<
	C extends ReadonlyArray<unknown>,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
	RetainsOptions extends boolean = true,
> = {
	[I in keyof C]: C[I] extends ReadonlyArray<unknown>
		? {
				[J in keyof C[I]]: C[I][J] &
					ValidateUserConfigItem<C[I][J], Chain, VK, RetainsOptions>;
			}
		: C[I] & ValidateUserConfigItem<C[I], Chain, VK, RetainsOptions>;
};

type NormalizeSeverity<S> = S extends 2 | "error"
	? "error"
	: S extends 1 | "warn"
		? "warn"
		: S extends 0 | "off"
			? "off"
			: never;

type DeepWritable<T> = T extends (...parameters: ReadonlyArray<never>) => unknown
	? T
	: T extends object
		? { -readonly [K in keyof T]: DeepWritable<T[K]> }
		: T;

type NormalizeEntry<E> = E extends readonly [infer S, ...infer O]
	? [NormalizeSeverity<S>, ...DeepWritable<O>]
	: [NormalizeSeverity<E>];

type SeverityOf<E> = E extends { severityOnly: infer S }
	? NormalizeSeverity<S>
	: E extends readonly [infer S, ...ReadonlyArray<unknown>]
		? NormalizeSeverity<S>
		: NormalizeSeverity<E>;

/** Any severity accepted by ESLint rule entries. */
type RuleSeverityInput = 0 | 1 | 2 | "error" | "off" | "warn";

type IsSeverityOnly<E> = E extends RuleSeverityInput
	? true
	: E extends readonly [RuleSeverityInput]
		? true
		: false;

/* oxlint-disable typescript/no-unnecessary-type-parameters -- The single-use T is the variance probe that makes this exact-equality check work. */
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/* oxlint-enable typescript/no-unnecessary-type-parameters */

type RobloxAxis<O> = O extends { roblox: infer R }
	? [R] extends [false]
		? "std"
		: [false] extends [R]
			? "roblox" | "std"
			: "roblox"
	: "roblox";

/**
 * Distributes over a widened axis so an unknown `roblox` widens `type` too.
 *
 * @template A - The resolved roblox axis (possibly a union).
 */
type DefaultTypeAxis<A> = A extends "std" ? "package" : "game";

type TypeAxis<O> = O extends { type: infer T }
	? T extends "package"
		? "package"
		: T extends "app" | "game"
			? "game"
			: "game" | "package"
	: DefaultTypeAxis<RobloxAxis<O>>;

/** Sentinel: this variant has no preset default for the rule. */
interface NoDefault {
	"no default": true;
}

type ResolveVariant<D, VK extends VariantKey> = D extends { "*": infer E }
	? E
	: VK extends keyof D
		? D[keyof D & VK]
		: never;

/**
 * Resolve one variant's effective default through the chain (delta maps first,
 * base map last). A delta map that knows the rule but not this variant falls
 * through — delta entries only record variants whose value differs from the
 * base.
 *
 * @template K - The rule name.
 * @template Chain - Ordered defaults maps, most specific scope first.
 * @template VK - A single variant key.
 */
type ResolveOne<K, Chain, VK extends VariantKey> = Chain extends readonly [
	infer Head,
	...infer Rest,
]
	? K extends keyof Head
		? [ResolveVariant<Head[K], VK>] extends [never]
			? ResolveOne<K, Rest, VK>
			: ResolveVariant<Head[K], VK>
		: ResolveOne<K, Rest, VK>
	: never;

/**
 * The effective default(s) for a rule across the selected variant key(s).
 * Distributes over a union `VK`: variants without a default contribute the
 * {@link NoDefault} sentinel, so a rule is only flagged when every possible
 * variant resolves to the same value the user wrote.
 *
 * @template K - The rule name.
 * @template Chain - Ordered defaults maps, most specific scope first.
 * @template VK - The variant key(s) selected by the factory options.
 */
type ChainDefault<K, Chain, VK extends VariantKey> = VK extends VariantKey
	? [ResolveOne<K, Chain, VK>] extends [never]
		? NoDefault
		: ResolveOne<K, Chain, VK>
	: never;

type ValidateEntry<K extends string, UserEntry, DefaultEntry, RetainsOptions extends boolean> = [
	DefaultEntry,
] extends [never]
	? UserEntry
	: [Extract<DefaultEntry, NoDefault>] extends [never]
		? IsRedundantEntry<UserEntry, DefaultEntry, RetainsOptions> extends true
			? RedundantRuleError<`'${K}' already defaults to this value in the preset; remove the override, or set \`redundancyCheck: false\` to disable this check`>
			: UserEntry
		: UserEntry;

type UnionToIntersection<U> = (U extends unknown ? (member: U) => void : never) extends (
	member: infer I,
) => void
	? I
	: never;

type ValidateUserConfigItem<
	Item,
	Chain extends ReadonlyArray<unknown>,
	VK extends VariantKey,
	RetainsOptions extends boolean,
> = Item extends { files: unknown }
	? unknown
	: Item extends { rules: infer R }
		? { rules?: ValidateRulesAgainst<R, Chain, VK, RetainsOptions> }
		: unknown;
