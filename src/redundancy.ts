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
 */

/** Any severity accepted by ESLint rule entries. */
export type RuleSeverityInput = 0 | 1 | 2 | "error" | "off" | "warn";

/**
 * Whether a user-written rule entry is redundant against the preset default
 * entry for the same rule.
 *
 * @template UserEntry - The user-written rule entry.
 * @template DefaultEntry - The preset default entry.
 */
export type IsRedundantEntry<UserEntry, DefaultEntry> =
	IsSeverityOnly<UserEntry> extends true
		? Equal<SeverityOf<UserEntry>, SeverityOf<DefaultEntry>>
		: Equal<NormalizeEntry<UserEntry>, NormalizeEntry<DefaultEntry>>;

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
 * Per-rule defaults record in the generated maps: either invariant (`"*"`) or
 * keyed by the variants where the values differ.
 */
export type DefaultVariants = Partial<Record<VariantKey, unknown>> & { "*"?: unknown };

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
 */
export type ValidateRulesAgainst<R, Chain extends ReadonlyArray<unknown>, VK extends VariantKey> = {
	[K in keyof R]: ValidateEntry<K & string, R[K], LookupVariants<K, Chain>, VK>;
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

type SeverityOf<E> = E extends readonly [infer S, ...ReadonlyArray<unknown>]
	? NormalizeSeverity<S>
	: NormalizeSeverity<E>;

type IsSeverityOnly<E> = E extends RuleSeverityInput
	? true
	: E extends readonly [RuleSeverityInput]
		? true
		: false;

/* oxlint-disable typescript/no-unnecessary-type-parameters -- The single-use T is the variance probe that makes this exact-equality check work. */
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/* oxlint-enable typescript/no-unnecessary-type-parameters */

type RobloxAxis<O> = O extends { roblox: false } ? "std" : "roblox";

type TypeAxis<O> = O extends { type: infer T }
	? T extends "package"
		? "package"
		: T extends "app" | "game"
			? "game"
			: "game" | "package"
	: RobloxAxis<O> extends "std"
		? "package"
		: "game";

/**
 * Find a rule's variants record in an ordered chain of scope maps (delta maps
 * first, base map last). `never` when no map knows the rule.
 *
 * @template K - The rule name.
 * @template Chain - Ordered defaults maps, most specific scope first.
 */
type LookupVariants<K, Chain> = Chain extends readonly [infer Head, ...infer Rest]
	? K extends keyof Head
		? Head[K]
		: LookupVariants<K, Rest>
	: never;

type ResolveDefault<D, VK extends VariantKey> = D extends { "*": infer E }
	? E
	: [VK] extends [keyof D]
		? D[VK]
		: never;

type ValidateEntry<K extends string, UserEntry, D, VK extends VariantKey> = [
	ResolveDefault<D, VK>,
] extends [infer DefaultEntry]
	? [DefaultEntry] extends [never]
		? UserEntry
		: IsRedundantEntry<UserEntry, DefaultEntry> extends true
			? RedundantRuleError<`'${K}' already defaults to this value in the preset; remove the override, or set \`redundancyCheck: false\` to disable this check`>
			: UserEntry
	: never;
