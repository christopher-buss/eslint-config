// cspell:words lintable typeaware
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { normalizePath } from "./cache.ts";
import { classifyIgnored } from "./ignored-predicate.ts";
import type { IgnoredPayload } from "./ignored-predicate.ts";
import { resolveIgnoredHelper } from "./resolve.ts";
import { readState, statePath, writeState } from "./state.ts";

/** The persisted form of a resolved ignore set. */
interface IgnoredState {
	/** The config hash the payload was computed against. */
	hash: string;
	/** What the helper returned: the config's patterns, or bare answers. */
	payload: IgnoredPayload;
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
 * What is memoised is the config's *patterns*, not its answers about one
 * target list. Storing answers made the memo a partial function over a file
 * list that kept moving: every file added after the last config change was
 * absent from the set, counted not-ignored, and floored the typed pass's dirty
 * count above zero forever. Patterns depend on the config alone, which is what
 * the key already says, so new files classify with no helper spawn at all.
 *
 * A config whose `files`/`ignores` hold function matchers cannot be
 * serialized; the helper falls back to answering per target, and that payload
 * keeps the old residual — targets absent from it read as not-ignored, which
 * over-counts dirty files rather than skipping work.
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
		return toSet(classifyIgnored(cwd, stored.payload, targets));
	}

	if (!mutate) {
		return EMPTY;
	}

	const payload = queryIgnoredFiles(cwd, targets);
	if (payload === undefined) {
		return EMPTY;
	}

	writeState(stateFile, { hash: configHash, payload } satisfies IgnoredState);
	return toSet(classifyIgnored(cwd, payload, targets));
}

/**
 * Reduce a classification to the normalized keys the file lists are filtered
 * by.
 *
 * @param ignored - The ignored targets, or `undefined` when unavailable.
 * @returns The ignored set, empty when there is nothing to filter by.
 */
function toSet(ignored: Array<string> | undefined): ReadonlySet<string> {
	return ignored === undefined || ignored.length === 0
		? EMPTY
		: new Set(ignored.map((file) => normalizePath(file)));
}

/**
 * Spawn the helper and read back its payload. Every failure mode (no
 * resolvable ESLint, a config that throws, a malformed result) degrades to
 * `undefined`, which the caller treats as "no filtering" — the behaviour
 * before this existed.
 *
 * The result comes back through a scratch file rather than stdout: loading a
 * consumer's config evaluates their plugins, and anything one of those prints
 * would land in the middle of the JSON.
 *
 * @param cwd - The consumer project root.
 * @param targets - The target files the fallback path classifies.
 * @returns The helper's payload, or `undefined` when the query failed.
 */
function queryIgnoredFiles(cwd: string, targets: Array<string>): IgnoredPayload | undefined {
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
		const parsed = JSON.parse(fs.readFileSync(outFile, "utf8")) as { mode?: unknown };
		return parsed.mode === "answers" || parsed.mode === "predicate"
			? (parsed as IgnoredPayload)
			: undefined;
	} catch {
		return undefined;
	} finally {
		fs.rmSync(outFile, { force: true });
	}
}
