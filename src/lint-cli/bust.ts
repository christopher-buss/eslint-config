// cspell:words typeaware
import fs from "node:fs";
import path from "node:path";

import {
	ALL_CACHE_FILES,
	CACHE_FILE_DEFAULT,
	CACHE_FILE_TYPE_AWARE,
	cacheFileFor,
} from "./constants.ts";
import type { RunContext } from "./context.ts";
import { statePath, swapState } from "./state.ts";

/**
 * One hash-drift bust: a hash this run computed, compared against the one the
 * last run stored, and the caches to delete when the two differ.
 *
 * Both busts here are the same compare-and-swap over a keyed state file; what
 * distinguishes them is only *what* is hashed and *which* caches that
 * invalidates. Keeping them as data rather than as two near-identical functions
 * puts that difference — the asymmetry below about the fast cache — in one
 * readable place.
 */
export interface HashBust {
	/** State-file base name; the run's variant key is appended to it. */
	name: string;
	/**
	 * Cache base names to delete when the hash changed (see `cacheFileFor`).
	 */
	caches: ReadonlyArray<string>;
}

/** Outcome of a hash-drift check. */
export interface BustOutcome {
	/** True when the hash changed and this variant's caches were deleted. */
	busted: boolean;
	/** True when no prior hash existed (state stored, no bust). */
	firstRun: boolean;
}

/**
 * The resolved ESLint config's content changed.
 *
 * Deletes all three caches, the fast (syntactic-only) one included: a config
 * change such as a rule-severity flip alters a syntactic lint too. This is why
 * it is evaluated before {@link PACKAGE_RESOLUTION}, which spares that cache.
 */
export const CONFIG_DRIFT: HashBust = {
	name: "config-hash",
	caches: ALL_CACHE_FILES,
};

/**
 * The consumer's `package.json` resolution surface changed.
 *
 * Deletes only the two type-aware caches (`.eslintcache-typeaware-<key>` and
 * `.eslintcache-<key>`), leaving `.eslintcache-fast-<key>` intact: a resolution
 * change alters which types an importer sees, and a syntactic lint does not
 * look at types.
 */
export const PACKAGE_RESOLUTION: HashBust = {
	name: "package-json-hash",
	caches: [CACHE_FILE_DEFAULT, CACHE_FILE_TYPE_AWARE],
};

/**
 * Delete this variant's affected caches when the bust's hash changed since the
 * last run. The first run only stores the hash.
 *
 * The state file is keyed per config variant because the stored hash is
 * consumed once: after the first run that sees a new hash, every later run
 * finds `stored === hash` and returns early. A shared state file would let
 * whichever variant ran first absorb the change on behalf of all of them,
 * leaving every cache it did not delete permanently stale with respect to it.
 * Only this variant's cache files are deleted, for the same reason.
 *
 * Takes the hash rather than computing it, so `undefined` unambiguously means
 * "could not be computed" (no config entry point, no resolvable TypeScript, no
 * readable `package.json`) and the check degrades to a no-op — and so the
 * planner can share one config hash between this bust and the ignore-set memo.
 *
 * @param run - The run context.
 * @param bust - Which hash this is, and what it invalidates.
 * @param hash - The hash this run computed, or `undefined` when unavailable.
 * @returns The bust outcome.
 */
export function applyHashBust(
	run: RunContext,
	bust: HashBust,
	hash: string | undefined,
): BustOutcome {
	if (hash === undefined) {
		return { busted: false, firstRun: false };
	}

	const swap = swapState(statePath(run.cwd, bust.name, run.key), hash);
	if (swap !== "changed") {
		return { busted: false, firstRun: swap === "first" };
	}

	for (const base of bust.caches) {
		fs.rmSync(path.resolve(run.cwd, cacheFileFor(base, run.key)), { force: true });
	}

	return { busted: true, firstRun: false };
}
