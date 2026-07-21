/**
 * The serialized form of a resolved config's match/ignore patterns, and the
 * in-process evaluation of it. Produced by {@link file://./ignored-child.ts},
 * consumed by {@link file://./ignored.ts}.
 *
 * The patterns are evaluated with the same `@eslint/config-array` the
 * consumer's ESLint uses, not a re-implementation: the matcher is the part
 * that has to agree exactly, since a file wrongly classified as ignored is
 * dropped from the dirty count and can skip a typed pass that had work to do.
 */
import { createRequire } from "node:module";
import path from "node:path";

/**
 * One resolved config object, reduced to what decides matching and ignoring.
 */
export interface PredicateEntry {
	/** The config's name, kept only so errors name the offending entry. */
	name?: string;
	/** The config's own base path, when it declared one. */
	basePath?: string;
	/** The config's `files`, which may nest arrays for AND matching. */
	files?: Array<Array<string> | string>;
	/** The config's `ignores`. */
	ignores?: Array<string>;
	/**
	 * Set when the config carried keys beyond the match ones. A config with
	 * `ignores` and nothing else is a *global* ignore; one with any further key
	 * only excludes files from itself. Dropping `rules` and friends on the way
	 * out would silently promote the second kind into the first, so this marks
	 * the difference the dropped keys used to carry.
	 */
	nonGlobal?: boolean;
}

/** What the helper writes back, and what the ignore-set state stores. */
export type IgnoredPayload =
	/** The config's patterns, which classify any path at all. */
	| { basePath: string; entries: Array<PredicateEntry>; mode: "predicate" }
	/** The ignored subset of one target list, valid only for those targets. */
	| { ignored: Array<string>; mode: "answers" };

/** The subset of `ConfigArray` this module uses. */
interface ConfigArrayLike {
	getConfigStatus: (filePath: string) => string;
	normalizeSync: () => void;
}

/**
 * The subset of the `@eslint/config-array` module namespace this module uses.
 */
interface ConfigArrayModule {
	ConfigArray: new (
		configs: Array<PredicateEntry>,
		options: { basePath: string; schema: Record<string, unknown> },
	) => ConfigArrayLike;
}

/**
 * The whole schema for {@link PredicateEntry.nonGlobal}: it carries no value
 * worth merging or checking, so both halves collapse to a constant.
 *
 * @returns A value the schema is satisfied by.
 */
function acceptMarker(): true {
	return true;
}

/**
 * Teaches the array's schema about {@link PredicateEntry.nonGlobal}, which is
 * ours rather than ESLint's: an unknown key throws when a matched config is
 * merged, which is exactly what classifying a file does.
 */
const PREDICATE_SCHEMA = {
	nonGlobal: { merge: acceptMarker, validate: acceptMarker },
};

/**
 * One built array per payload, so repeated calls in a process rebuild nothing.
 */
const arrayCache = new WeakMap<object, ConfigArrayLike | undefined>();

/**
 * Classify lint targets against a stored payload.
 *
 * An `"answers"` payload only knows the targets it was computed from, so
 * anything else is reported not-ignored — the safe direction, which over-counts
 * dirty files rather than skipping work. A `"predicate"` payload knows the
 * config itself and classifies any path, including files added since it was
 * stored.
 *
 * @param cwd - The consumer project root, used to resolve the matcher.
 * @param payload - The stored payload.
 * @param targets - The absolute target paths to classify.
 * @returns The ignored subset of `targets`, or `undefined` when the payload
 *   could not be evaluated.
 */
export function classifyIgnored(
	cwd: string,
	payload: IgnoredPayload,
	targets: Array<string>,
): Array<string> | undefined {
	if (payload.mode === "answers") {
		return payload.ignored;
	}

	const configArray = buildConfigArray(cwd, payload);
	if (configArray === undefined) {
		return undefined;
	}

	try {
		return targets.filter((target) => configArray.getConfigStatus(target) !== "matched");
	} catch {
		return undefined;
	}
}

/**
 * Load the matcher out of the consumer's own ESLint installation, so the
 * patterns are evaluated by the same version that produced them. Falls back to
 * the ESLint resolvable from this file — the hoisted peer dependency, which is
 * what the fixture tests run against.
 *
 * @param cwd - The consumer project root.
 * @returns The `@eslint/config-array` module namespace.
 * @throws {Error} When neither ESLint nor its config-array can be resolved.
 */
function loadConfigArrayModule(cwd: string): ConfigArrayModule {
	// A synthetic basename: `createRequire` resolves relative to a *file*, and
	// this one is spelled so it can never collide with a real consumer module.
	const requireFrom = createRequire(path.join(cwd, "__isentinel-lint__.js"));
	let eslintPackageJson: string;
	try {
		eslintPackageJson = requireFrom.resolve("eslint/package.json");
	} catch {
		eslintPackageJson = createRequire(import.meta.url).resolve("eslint/package.json");
	}

	return createRequire(eslintPackageJson)("@eslint/config-array") as ConfigArrayModule;
}

/**
 * Rebuild the ignore predicate from stored patterns, memoised per payload.
 *
 * @param cwd - The consumer project root, used to resolve the matcher.
 * @param payload - The stored predicate payload.
 * @returns The normalized config array, or `undefined` when it cannot be built.
 */
function buildConfigArray(
	cwd: string,
	payload: Extract<IgnoredPayload, { mode: "predicate" }>,
): ConfigArrayLike | undefined {
	const cached = arrayCache.get(payload);
	if (cached !== undefined || arrayCache.has(payload)) {
		return cached;
	}

	let configArray: ConfigArrayLike | undefined;
	try {
		const { ConfigArray } = loadConfigArrayModule(cwd);
		configArray = new ConfigArray(payload.entries, {
			basePath: payload.basePath,
			schema: PREDICATE_SCHEMA,
		});
		configArray.normalizeSync();
	} catch {
		configArray = undefined;
	}

	arrayCache.set(payload, configArray);
	return configArray;
}
