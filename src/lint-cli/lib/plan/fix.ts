// cspell:words lintable
import path from "node:path";

import { CACHE_FILE_DEFAULT, cacheFileFor } from "../cache/constants.ts";
import { openCache } from "../cache/entries.ts";
import type { ChildCommand, LintCliOptions } from "../cli/types.ts";
import type { RunContext } from "../context.ts";
import type { RepoFiles } from "../files/collect.ts";
import { composeEslintCommand } from "./command.ts";
import { computeWorkerCount } from "./concurrency.ts";
import type { WorkerLimits } from "./concurrency.ts";
import { FULL_PASS } from "./passes.ts";
import type { PassPlan } from "./sizing.ts";

/** Everything composing a run's fix child needs beyond its passes. */
export interface FixInputs {
	/**
	 * Absolute path to the agent ESLint formatter (empty unless `--agents`).
	 */
	agentsFormatterPath: string;
	/** The lint-target lists the passes were sized against. */
	files: RepoFiles;
	/** The resolved worker limits, for sizing the child. */
	limits: WorkerLimits;
	/** The parsed CLI options. */
	options: LintCliOptions;
}

/**
 * The files the check passes had a message about, in pass order and without
 * duplicates.
 *
 * Read out of each pass's own cache rather than out of its output. ESLint
 * stores the lint result beside every entry and replays it on a cache hit, so
 * the cache is the pass's whole-tree verdict whichever files it actually
 * re-linted this run — including for a pass that auto-skipped, whose verdict
 * stands precisely because nothing it cares about changed.
 *
 * Each pass only contributes the targets it lints: the type-aware pass never
 * sees the JSON and Markdown the fast pass covers.
 *
 * @param passes - The planned passes, run and auto-skipped alike.
 * @param run - The run context.
 * @param files - The lint-target lists to look the verdict up against.
 * @returns The reported files, empty when every pass came back clean.
 */
export function collectFixTargets(
	passes: Array<PassPlan>,
	run: RunContext,
	files: RepoFiles,
): Array<string> {
	const targets = new Set<string>();

	for (const pass of passes) {
		const cache = openCache(path.resolve(run.cwd, pass.cacheFile), run.ci);
		const candidates = pass.descriptor.typeAwareOnly ? files.typeAware : files.lintable;
		const reported = cache?.filesWithMessages(candidates) ?? [];
		for (const file of reported) {
			targets.add(file);
		}
	}

	return [...targets];
}

/**
 * Compose the one ESLint child a `--fix` run spawns after its checks, or
 * `undefined` when they reported nothing and there is nothing to fix.
 *
 * The child runs the full config — a superset of both check configs, so it can
 * fix anything either of them found — over only the reported files. Being one
 * child, it is also the run's only ESLint writer.
 *
 * Its cache entries for those files are dropped first. The full config's cache
 * gets none of the invalidation the check caches do (no builder runs against
 * it), so it can hold a stale clean entry for a file the checks have since
 * found a message on, and ESLint would skip the very file it was handed.
 *
 * Two cases have no verdict to narrow by, and fall back to the run's own paths
 * — the whole tree, as a fix run always used to lint: `--no-cache`, which
 * records nothing, and an out-of-cwd target, which the repo listing the passes
 * were sized against cannot see (see {@link RepoFiles.targetsOutsideCwd}).
 *
 * @param passes - The planned passes whose verdicts narrow the child.
 * @param run - The run context.
 * @param inputs - The lint-target lists, CLI options, limits and formatter path.
 * @returns The fix child, or `undefined` when nothing was reported.
 */
export function planFixChild(
	passes: Array<PassPlan>,
	run: RunContext,
	inputs: FixInputs,
): ChildCommand | undefined {
	const { files, limits, options } = inputs;
	const narrowable = options.cache && !files.targetsOutsideCwd;
	const targets = narrowable ? collectFixTargets(passes, run, files) : options.paths;
	if (targets.length === 0) {
		return undefined;
	}

	const cacheFile = cacheFileFor(CACHE_FILE_DEFAULT, run.key);
	if (narrowable) {
		openCache(path.resolve(run.cwd, cacheFile), run.ci)?.removeEntries(targets);
	}

	return composeEslintCommand(options, {
		agentsFormatterPath: inputs.agentsFormatterPath,
		cacheLocation: cacheFile,
		ci: run.ci,
		concurrency:
			options.concurrency ??
			computeWorkerCount({
				dirtyCount: targets.length,
				filesPerWorker: limits.filesPerWorker,
				maxWorkers: limits.typedMaxWorkers,
			}),
		eslintLabel: FULL_PASS.label,
		fix: true,
		paths: targets,
		typeAwareEnv: FULL_PASS.typeAwareEnv,
	});
}
