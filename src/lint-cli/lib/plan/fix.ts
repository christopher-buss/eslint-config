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

/** What the fix child is derived from, beyond the passes and the run. */
export interface FixInputs {
	/** The lint-target lists the passes were sized against. */
	files: RepoFiles;
	/** The parsed CLI options. */
	options: LintCliOptions;
}

/** Everything composing the fix child needs on top of {@link FixInputs}. */
export interface FixChildInputs extends FixInputs {
	/**
	 * Absolute path to the agent ESLint formatter (empty unless `--agents`).
	 */
	agentsFormatterPath: string;
	/** The resolved worker limits, for sizing the child. */
	limits: WorkerLimits;
}

/**
 * The files a `--fix` run should hand its fix child: everything the check
 * passes had a message about, in pass order and without duplicates.
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
 * With `--no-cache` there is no verdict to read, so the child cannot be
 * narrowed and gets the run's own paths — the whole tree, as before.
 *
 * @param passes - The planned passes, run and auto-skipped alike.
 * @param run - The run context.
 * @param inputs - The lint-target lists and CLI options.
 * @returns The fix child's target paths.
 */
export function collectFixTargets(
	passes: Array<PassPlan>,
	run: RunContext,
	{ files, options }: FixInputs,
): Array<string> {
	if (!options.cache) {
		return options.paths;
	}

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
 * `undefined` when the checks reported nothing and there is nothing to fix.
 *
 * The child runs the full config — a superset of both check configs, so it can
 * fix anything either of them found — over only the reported files. Being one
 * child, it is also the run's only writer.
 *
 * Its cache entries for those files are dropped first. The full config's cache
 * gets none of the invalidation the check caches do (no builder runs against
 * it), so it can hold a stale clean entry for a file the checks have since
 * found a message on, and ESLint would skip the very file it was handed.
 *
 * @param passes - The planned passes whose verdicts narrow the child.
 * @param run - The run context.
 * @param inputs - The lint-target lists, CLI options, limits and formatter path.
 * @returns The fix child, or `undefined` when nothing was reported.
 */
export function planFixChild(
	passes: Array<PassPlan>,
	run: RunContext,
	inputs: FixChildInputs,
): ChildCommand | undefined {
	const targets = collectFixTargets(passes, run, inputs);
	if (targets.length === 0) {
		return undefined;
	}

	const cacheFile = cacheFileFor(CACHE_FILE_DEFAULT, run.key);
	const cacheLocation = path.resolve(run.cwd, cacheFile);
	if (inputs.options.cache) {
		openCache(cacheLocation, run.ci)?.removeEntries(targets);
	}

	const { limits, options } = inputs;
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
