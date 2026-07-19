// cspell:words normalised
import fs from "node:fs";

import { computeAffectedFiles } from "./affected.ts";
import type { DirtyCache } from "./cache.ts";
import { normalizePath, removeCacheEntries } from "./cache.ts";
import { resolveAffectedBustThreshold } from "./constants.ts";
import type { TypeAwareMode } from "./types.ts";

/** Inputs to one type-aware invalidation pass. */
export interface InvalidationRequest {
	/** Normalised paths already dirty by mtime/checksum. */
	alreadyDirty: ReadonlySet<string>;
	/**
	 * The already-loaded cache to remove entries from, reusing the handle the
	 * caller opened for the dirty query. When omitted, opened afresh.
	 */
	cache?: DirtyCache;
	/** Absolute path to the mode's ESLint cache file. */
	cacheLocation: string;
	/** The consumer project root. */
	cwd: string;
	/** Environment variables (for the bust-threshold override). */
	environment: NodeJS.ProcessEnv;
	/** The active ESLint type-aware mode (never `"off"`). */
	mode: TypeAwareMode | undefined;
	/** The lint-target files for this run. */
	targetFiles: Array<string>;
}

/** Outcome of one type-aware invalidation pass. */
export interface InvalidationOutcome {
	/** True when the escape valve deleted the whole mode cache file. */
	busted: boolean;
	/**
	 * True when the builder ran for the first time (state persisted, no bust).
	 */
	firstRun: boolean;
	/** Normalised paths whose cache entries were removed this run. */
	invalidated: Array<string>;
	/** True when the builder path was skipped or failed. */
	skipped: boolean;
}

/**
 * Fold TypeScript builder-based invalidation into the ESLint cache. Computes
 * the affected set (files whose type-aware results may have changed because a
 * file they import changed), then either:
 *
 * - persists state only, when this is the builder's first run (its affected set
 *   is meaningless — everything is "affected");
 * - deletes the mode cache wholesale, when the affected set exceeds the bust
 *   threshold (surgical removal stops paying off);
 * - surgically removes the affected files that are lint targets and not already
 *   dirty by mtime/checksum.
 *
 * Never throws: a skipped/failed builder yields a no-op outcome.
 *
 * @param request - The invalidation inputs.
 * @returns The invalidation outcome.
 */
export function applyTypeAwareInvalidation({
	alreadyDirty,
	cache,
	cacheLocation,
	cwd,
	environment,
	mode,
	targetFiles,
}: InvalidationRequest): InvalidationOutcome {
	const result = computeAffectedFiles(cwd, mode);
	if (result === undefined) {
		return { busted: false, firstRun: false, invalidated: [], skipped: true };
	}

	if (result.firstRun) {
		return { busted: false, firstRun: true, invalidated: [], skipped: false };
	}

	const threshold = resolveAffectedBustThreshold(environment);
	if (result.affected.size > threshold) {
		fs.rmSync(cacheLocation, { force: true });
		return { busted: true, firstRun: false, invalidated: [], skipped: false };
	}

	const targets = new Set<string>();
	for (const file of targetFiles) {
		targets.add(normalizePath(file));
	}

	const invalidated: Array<string> = [];
	for (const affected of result.affected) {
		const key = normalizePath(affected);
		if (targets.has(key) && !alreadyDirty.has(key)) {
			invalidated.push(key);
		}
	}

	if (cache !== undefined) {
		cache.removeEntries(invalidated);
	} else {
		removeCacheEntries(cacheLocation, invalidated);
	}

	return { busted: false, firstRun: false, invalidated, skipped: false };
}
