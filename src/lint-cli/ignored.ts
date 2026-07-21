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

/** A target list split by whether ESLint would lint it. */
interface Classification {
	/** The targets ESLint declines to lint. */
	ignored: Array<string>;
	/** The rest. */
	linted: Array<string>;
}

/** The persisted form of a resolved ignore set. */
interface IgnoredState {
	/**
	 * Every target the payload has already been asked about, as {@link
	 * normalizePath} keys. Purely derived — the payload can recompute it — but
	 * matching a path against a real flat config costs ~300µs, so a project of
	 * any size would pay whole seconds of it on every run.
	 */
	classified: Classification;
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
 * The answers are still stored, but now as a cache *derived* from the patterns
 * rather than as the source of truth: a target the cache does not cover is
 * matched against the patterns rather than assumed not-ignored, which is the
 * whole difference. It exists because that match costs ~300µs per path, so a
 * few thousand targets would otherwise add a second to every run — the cost the
 * memo exists to avoid, charged a little at a time.
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
	const fresh = stored?.hash === configHash ? stored : undefined;

	let payload = fresh?.payload;
	if (payload === undefined) {
		if (!mutate) {
			return EMPTY;
		}

		payload = queryIgnoredFiles(cwd, targets);
		if (payload === undefined) {
			return EMPTY;
		}
	}

	const classified = classifyTargets(cwd, payload, targets, fresh?.classified);
	if (classified === undefined) {
		return EMPTY;
	}

	if (mutate && !sameClassification(classified, fresh?.classified)) {
		writeState(stateFile, { classified, hash: configHash, payload } satisfies IgnoredState);
	}

	return new Set(classified.ignored);
}

/**
 * Split the targets by whether ESLint would lint them, asking the payload only
 * about the ones the stored classification does not already cover — which after
 * the first run means only the files added since it.
 *
 * The result covers exactly the current targets, so storing it also drops the
 * entries for files that have gone away.
 *
 * @param cwd - The consumer project root.
 * @param payload - The patterns (or answers) to classify against.
 * @param targets - The absolute target paths this run cares about.
 * @param cached - The stored classification, when one applies to this payload.
 * @returns The split, or `undefined` when the payload could not be evaluated.
 */
function classifyTargets(
	cwd: string,
	payload: IgnoredPayload,
	targets: Array<string>,
	cached: Classification | undefined,
): Classification | undefined {
	const known = new Map<string, boolean>();
	const cachedIgnored = cached?.ignored ?? [];
	const cachedLinted = cached?.linted ?? [];
	for (const file of cachedIgnored) {
		known.set(file, true);
	}

	for (const file of cachedLinted) {
		known.set(file, false);
	}

	const byKey = new Map(targets.map((target) => [normalizePath(target), target]));
	const unknown = [...byKey].filter(([key]) => !known.has(key));
	if (unknown.length > 0) {
		const ignored = classifyIgnored(
			cwd,
			payload,
			unknown.map(([, target]) => target),
		);
		if (ignored === undefined) {
			return undefined;
		}

		const ignoredKeys = new Set(ignored.map((file) => normalizePath(file)));
		for (const [key] of unknown) {
			known.set(key, ignoredKeys.has(key));
		}
	}

	const classified: Classification = { ignored: [], linted: [] };
	for (const key of byKey.keys()) {
		(known.get(key) === true ? classified.ignored : classified.linted).push(key);
	}

	return classified;
}

/**
 * Whether a classification is the one already on disk, so an unchanged run can
 * skip rewriting it.
 *
 * @param classified - The classification this run computed.
 * @param cached - The stored classification, when one applies.
 * @returns True when the two cover the same targets.
 */
function sameClassification(
	classified: Classification,
	cached: Classification | undefined,
): boolean {
	return (
		cached !== undefined &&
		cached.ignored.length === classified.ignored.length &&
		cached.linted.length === classified.linted.length
	);
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
		// Trusted as far as its tag: the writer is our own child, and anything it
		// got wrong past that throws where the payload is used, which is caught
		// the same way as a failed spawn.
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
