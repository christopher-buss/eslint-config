import crypto from "node:crypto";

import { isCi, isInAgentSession, isInEditorEnvironment } from "../utils.ts";

/** Length of the hex digest slice used to suffix cache and state files. */
const CACHE_KEY_LENGTH = 8;

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
