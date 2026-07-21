// cspell:words lintable typeaware
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { normalizePath } from "./cache.ts";
import { resolveIgnoredHelper } from "./resolve.ts";
import { readState, statePath, writeState } from "./state.ts";

/** The persisted form of a resolved ignore set. */
interface IgnoredState {
	/** The config hash the set was computed against. */
	hash: string;
	/** The ignored targets, as {@link normalizePath} keys. */
	ignored: Array<string>;
}

/** Reused for every miss, so callers never allocate on the no-op path. */
const EMPTY: ReadonlySet<string> = new Set<string>();

/** Inputs to {@link resolveIgnoredFiles}. */
export interface IgnoredFilesContext {
	/** The config-variant key from `resolveCacheKey`. */
	key: string;
	/** The config hash for this run, or `undefined` when unavailable. */
	configHash: string | undefined;
	/** The consumer project root. */
	cwd: string;
	/**
	 * Whether the run may spawn the helper and write state (`--print` may
	 * not).
	 */
	mutate: boolean;
	/** Every lintable target, absolute (see `RepoFiles.lintable`). */
	targets: Array<string>;
}

/**
 * Resolve the persisted ignore-set file for a config variant, keyed by the same
 * variant as the config hash it stores.
 *
 * @param cwd - The consumer project root.
 * @param key - The config-variant key from `resolveCacheKey`.
 * @returns The absolute path to the stored ignore-set file.
 */
export function ignoredStatePath(cwd: string, key: string): string {
	return statePath(cwd, "ignored", key);
}

/**
 * The lint targets ESLint declines to lint, as {@link normalizePath} keys, so
 * the runner can drop them from its dirty count.
 *
 * The file lists come from `git ls-files` filtered by extension and know
 * nothing of the config's own `ignores`. ESLint writes no cache entry for a
 * file it never lints, so every consumer-ignored file is reported dirty on
 * every run, forever — which floors the type-aware pass's dirty count above
 * zero and makes its auto-skip unreachable.
 *
 * Asking ESLint itself is the only correct answer, but loading a consumer's
 * flat config costs several seconds. It is therefore memoised against the same
 * config hash that drives the cache-drift bust: the answer can only change when
 * the resolved config changes. That recompute is a blocking cost on the run
 * that pays it, but it is a run whose caches the drift bust just deleted, so
 * every file re-lints anyway — and the ignore set still sizes that re-lint's
 * workers, which is why it is computed then rather than deferred.
 *
 * Targets absent from a stored set are treated as not-ignored. That is the safe
 * direction — it can only over-count dirty files, never skip a pass that had
 * work to do — but it does mean a newly added ignored file keeps the typed pass
 * awake until the next config change.
 *
 * @param context - The cwd, variant key, config hash, targets and mutate flag.
 * @returns The ignored subset of `targets`, or an empty set when unavailable.
 */
export function resolveIgnoredFiles({
	key,
	configHash,
	cwd,
	mutate,
	targets,
}: IgnoredFilesContext): ReadonlySet<string> {
	if (configHash === undefined || targets.length === 0) {
		return EMPTY;
	}

	const stateFile = ignoredStatePath(cwd, key);
	const stored = readState<IgnoredState>(stateFile);
	if (stored?.hash === configHash) {
		return new Set(stored.ignored);
	}

	if (!mutate) {
		return EMPTY;
	}

	const ignored = queryIgnoredFiles(cwd, targets)?.map((file) => normalizePath(file));
	if (ignored === undefined) {
		return EMPTY;
	}

	writeState(stateFile, { hash: configHash, ignored } satisfies IgnoredState);
	return new Set(ignored);
}

/**
 * Spawn the helper and read back the ignored subset. Every failure mode (no
 * resolvable ESLint, a config that throws, a malformed result) degrades to
 * `undefined`, which the caller treats as "no filtering" — the behaviour before
 * this existed.
 *
 * The result comes back through a scratch file rather than stdout: loading a
 * consumer's config evaluates their plugins, and anything one of those prints
 * would land in the middle of the JSON.
 *
 * @param cwd - The consumer project root.
 * @param targets - The target files to classify.
 * @returns The ignored targets, or `undefined` when the query failed.
 */
function queryIgnoredFiles(cwd: string, targets: Array<string>): Array<string> | undefined {
	// One query per process at a time, so the pid is collision-free even when
	// the consumer lints several packages in parallel.
	const outFile = path.join(os.tmpdir(), `isentinel-lint-ignored-${process.pid}.json`);

	try {
		execFileSync(process.execPath, [resolveIgnoredHelper(), cwd, outFile], {
			cwd,
			input: JSON.stringify(targets),
			maxBuffer: 64 * 1024 * 1024,
			stdio: ["pipe", "ignore", "ignore"],
		});
		const parsed = JSON.parse(fs.readFileSync(outFile, "utf8")) as unknown;
		return Array.isArray(parsed) ? (parsed as Array<string>) : undefined;
	} catch {
		return undefined;
	} finally {
		fs.rmSync(outFile, { force: true });
	}
}
