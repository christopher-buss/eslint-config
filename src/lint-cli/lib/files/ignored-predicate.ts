// cspell:words unconfigured
/**
 * The serialized form of a resolved config's match patterns, and the in-process
 * evaluation of it. Produced by {@link file://./ignored-child.ts}, consumed by
 * {@link file://./ignored.ts}.
 *
 * The patterns are evaluated with the same `@eslint/config-array` the
 * consumer's ESLint uses, not a re-implementation: the matcher is the part
 * that has to agree exactly, since a file wrongly classified as ignored is
 * dropped from the dirty count and can skip a typed pass that had work to do.
 */
import { isRecord } from "../../../guards.ts";
import { resolveEslintInstall } from "../exec/eslint-install.ts";

/**
 * One resolved config object, reduced to what decides matching and ignoring.
 */
export interface PredicateEntry {
	/** The config's own base path, when it declared one. */
	basePath?: string;
	/** The config's `files`, which may nest arrays for AND matching. */
	files?: Array<Array<string> | string>;
	/** The config's `ignores`. */
	ignores?: Array<Array<string> | string>;
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
		options: { basePath: string },
	) => ConfigArrayLike;
}

/**
 * Classify lint targets against a stored payload.
 *
 * An `"answers"` payload only knows the targets it was computed from, so
 * anything else is reported not-ignored — the safe direction, which over-counts
 * dirty files rather than skipping work. A `"predicate"` payload knows the
 * config itself and classifies any path, including files added since it was
 * stored.
 *
 * A path counts as ignored when its status is anything but `"matched"`: a file
 * no config's `files` covers is `"unconfigured"` rather than `"ignored"`, and
 * ESLint declines to lint it just the same.
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
		const wanted = new Set(targets);
		return payload.ignored.filter((file) => wanted.has(file));
	}

	try {
		const { ConfigArray } = loadConfigArrayModule(cwd);
		const configArray = new ConfigArray(payload.entries, { basePath: payload.basePath });
		configArray.normalizeSync();
		return targets.filter((target) => configArray.getConfigStatus(target) !== "matched");
	} catch {
		return undefined;
	}
}

/**
 * Whether a required module exposes the `ConfigArray` constructor this module
 * uses.
 *
 * @param value - The required module's exports.
 * @returns Whether the exports carry a `ConfigArray` constructor.
 */
function isConfigArrayModule(value: unknown): value is ConfigArrayModule {
	return isRecord(value) && typeof value["ConfigArray"] === "function";
}

/**
 * Load the matcher out of the consumer's own ESLint installation, so the
 * patterns are evaluated by the same version that produced them.
 *
 * @param cwd - The consumer project root.
 * @returns The `@eslint/config-array` module namespace.
 * @throws {Error} When neither ESLint nor its config-array can be resolved.
 */
function loadConfigArrayModule(cwd: string): ConfigArrayModule {
	const required: unknown = resolveEslintInstall(cwd).requireFrom("@eslint/config-array");
	if (!isConfigArrayModule(required)) {
		throw new Error("@eslint/config-array did not export a ConfigArray constructor");
	}

	return required;
}
