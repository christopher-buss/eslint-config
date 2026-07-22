// cspell:words normalised
import fs from "node:fs";

import type { TypeAwareMode } from "../cli/types.ts";
import type { RunContext } from "../context.ts";
import { computeAffectedFiles } from "../typescript/affected.ts";
import { resolveAffectedBustThreshold } from "./constants.ts";
import type { DirtyCache } from "./entries.ts";
import { normalizePath } from "./entries.ts";

/** Inputs to one type-aware invalidation pass. */
export interface InvalidationRequest {
	/** Normalised paths already dirty by mtime/checksum. */
	alreadyDirty: ReadonlySet<string>;
	/**
	 * The already-loaded cache to remove entries from, reusing the handle the
	 * caller opened for the dirty query. `undefined` when the cache file does
	 * not exist, in which case there is nothing to remove entries from and
	 * every target file is already dirty.
	 */
	cache: DirtyCache | undefined;
	/** Absolute path to the mode's ESLint cache file. */
	cacheLocation: string;
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
 * @param run - The run context.
 * @param request - The invalidation inputs.
 * @returns The invalidation outcome.
 */
export function applyTypeAwareInvalidation(
	run: RunContext,
	{ alreadyDirty, cache, cacheLocation, mode, targetFiles }: InvalidationRequest,
): InvalidationOutcome {
	const result = computeAffectedFiles(run, mode);
	if (result === undefined) {
		return { busted: false, firstRun: false, invalidated: [], skipped: true };
	}

	if (result.firstRun) {
		return { busted: false, firstRun: true, invalidated: [], skipped: false };
	}

	const targets = new Set<string>();
	for (const file of targetFiles) {
		targets.add(normalizePath(file));
	}

	// Only affected files that are lint targets ever get surgically removed, so
	// gauge the escape valve against that intersection rather than the whole
	// in-project affected set (which counts files this run will never touch).
	const affectedTargets: Array<string> = [];
	for (const affected of result.affected) {
		const normalized = normalizePath(affected);
		if (targets.has(normalized)) {
			affectedTargets.push(normalized);
		}
	}

	const threshold = resolveAffectedBustThreshold(run.environment);
	if (affectedTargets.length > threshold) {
		fs.rmSync(cacheLocation, { force: true });
		return { busted: true, firstRun: false, invalidated: [], skipped: false };
	}

	// A missing cache (`undefined`) needs no removal: with no entries on disk
	// every target is dirty already, which is what the caller counted.
	const invalidated = affectedTargets.filter((target) => !alreadyDirty.has(target));
	cache?.removeEntries(invalidated);

	return { busted: false, firstRun: false, invalidated, skipped: false };
}
