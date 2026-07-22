import crypto from "node:crypto";

import { isCi, isInAgentSession, isInEditorEnvironment } from "../utils.ts";

/** Length of the hex digest slice used to suffix cache and state files. */
export const CACHE_KEY_LENGTH = 8;

/**
 * Environment variable a consumer sets to fold its own config branches into the
 * cache key. The env-derived key only sees the branches this preset owns, so a
 * consumer whose `eslint.config.*` varies on anything else — its own
 * `isInAgentSession()` check, a feature flag, an explicit `isAgent` /
 * `isInEditor` / `defaultSeverity` option — must name that branch here or its
 * variants will keep sharing (and overwriting) one cache.
 */
const CACHE_KEY_OVERRIDE = "ISENTINEL_LINT_CACHE_KEY";

/**
 * What every stage of a run needs to know about the run itself: where it
 * looks, which resolved-config variant it is, and whether it is allowed to
 * change anything on disk.
 *
 * These four facts used to be restated as separate parameters and context
 * fields by nearly every module here — the planner, the pass sizer, the ignore
 * resolver, the hash busts, the builder and the hybrid gate all needed some
 * subset. Threading one value instead keeps each of those interfaces to the
 * arguments that are actually specific to it, and gives tests a single place to
 * describe a run.
 */
export interface RunContext {
	/**
	 * The config-variant key (see {@link resolveCacheKey}). Every cache file
	 * and every state file this run touches is suffixed with it.
	 */
	key: string;
	/**
	 * Whether the run is in CI. Derived from {@link RunContext.environment} —
	 * carried here because it decides pass selection, the ESLint cache strategy
	 * and the cache's checksum mode, and re-deriving it per stage invited those
	 * three to disagree.
	 */
	ci: boolean;
	/** The working directory: the consumer project root. */
	cwd: string;
	/** The process environment, for the tuning overrides read from it. */
	environment: NodeJS.ProcessEnv;
	/**
	 * Whether the run may change on-disk state: spawn the ignore helper or the
	 * TypeScript builder, delete cache files, write state. False for `--print`,
	 * which sizes from what it finds but leaves it exactly as it was.
	 */
	mutate: boolean;
}

/**
 * Resolve the cache-variant key for this run. Every input that makes the preset
 * resolve a *different* ESLint config gets its own key, and therefore its own
 * cache file and its own per-cache state.
 *
 * This exists because ESLint stores a `hashOfConfig` per cache entry: two runs
 * whose resolved configs differ by even one rule severity invalidate each
 * other's entries wholesale when they share a cache file. An agent run and a
 * human run alternating against one cache re-lint the whole project in both
 * directions, forever. Splitting the file by variant means nothing is
 * invalidated — the variants simply stop overwriting each other.
 *
 * The key is derived from the environment rather than from the resolved config
 * because hashing the real config costs a full `eslint --print-config`
 * (~4.6s/run), and the key stored in an existing cache describes the *previous*
 * run, which cannot predict this one.
 *
 * @param environment - The process environment to derive the key from.
 * @returns An 8-character hex key identifying the config variant.
 */
export function resolveCacheKey(environment: NodeJS.ProcessEnv): string {
	const parts = [
		isInAgentSession(environment),
		isInEditorEnvironment(environment),
		isCi(environment),
		environment[CACHE_KEY_OVERRIDE] ?? "",
	];

	return crypto
		.createHash("sha256")
		.update(parts.join("|"))
		.digest("hex")
		.slice(0, CACHE_KEY_LENGTH);
}

/**
 * Describe a run from the process facts it starts with.
 *
 * @param cwd - The working directory.
 * @param environment - The process environment.
 * @param mutate - Whether the run may mutate (false for `--print`).
 * @returns The run context every stage is threaded.
 */
export function resolveRunContext(
	cwd: string,
	environment: NodeJS.ProcessEnv,
	mutate: boolean,
): RunContext {
	return {
		key: resolveCacheKey(environment),
		ci: isCi(environment),
		cwd,
		environment,
		mutate,
	};
}
