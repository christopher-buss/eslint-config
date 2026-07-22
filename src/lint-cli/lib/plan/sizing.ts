// cspell:words lintable typeaware
import path from "node:path";

import { cacheFileFor } from "../cache/constants.ts";
import type { DirtyCache } from "../cache/entries.ts";
import { isCacheStale, normalizePath, openCache } from "../cache/entries.ts";
import { applyTypeAwareInvalidation } from "../cache/invalidation.ts";
import type { LintCliOptions } from "../cli/types.ts";
import type { RunContext } from "../context.ts";
import type { RepoFiles } from "../files/collect.ts";
import type { WorkerLimits } from "./concurrency.ts";
import { computeWorkerCount } from "./concurrency.ts";
import type { PassDescriptor } from "./passes.ts";
import { maxWorkersFor, TYPED_PASS } from "./passes.ts";

/** The stderr notice emitted when the type-aware pass is skipped. */
export const TYPED_SKIP_NOTICE =
	"isentinel-lint: skipping the type-aware ESLint pass; no type-relevant files " +
	"changed since the last run.\n";

/** One planned ESLint pass: its descriptor, sizing and run/skip decision. */
export interface PassPlan {
	/**
	 * The pass's resolved cache file name for this run: its base name plus the
	 * config-variant key.
	 */
	cacheFile: string;
	/** The concurrency resolved for the pass. */
	concurrency: "off" | number;
	/** The pass descriptor (cache base name, label, type-aware env, sizing). */
	descriptor: PassDescriptor;
	/** Whether the pass runs; false when auto-skipped. */
	shouldRun: boolean;
	/** The stderr notice to emit when skipped, else undefined. */
	skipReason: string | undefined;
}

/**
 * What sizing needs beyond the run context: the file lists to count, the
 * resolved worker limits, and the up-front bust results the count depends on.
 */
export interface SizingInputs {
	/**
	 * The cache files the up-front stale sweep deleted (absolute paths). A pass
	 * whose cache is in here counts every file as dirty and skips the builder —
	 * everything re-lints regardless.
	 */
	clearedCaches: ReadonlySet<string>;
	/** The lint-target lists, already filtered of ESLint-ignored files. */
	files: RepoFiles;
	/** The resolved worker limits. */
	limits: WorkerLimits;
	/** The newest cache-bust mtime (see `maxMtimeMs`). */
	newestBustMtime: number | undefined;
	/** The parsed CLI options. */
	options: LintCliOptions;
}

/** Everything one pass is sized against. */
interface SizePassContext extends SizingInputs {
	/** Whether more than one pass was selected (the typed pass may skip). */
	multiPass: boolean;
	/** The run context. */
	run: RunContext;
}

/**
 * Size every selected pass: count the files each will re-lint, resolve its
 * concurrency, and decide whether it runs at all.
 *
 * The dirty count is the whole point. It routes on whether the run may mutate:
 * a real run clears stale caches and folds TypeScript builder invalidation into
 * the count, while `--print` only reports what is already dirty by
 * mtime/checksum and touches nothing. Callers see neither path — they get the
 * planned passes.
 *
 * @param descriptors - The passes to size, in run order.
 * @param run - The run context.
 * @param inputs - The file lists, limits and bust results to size against.
 * @returns The planned passes, in the same order.
 */
export function sizePasses(
	descriptors: Array<PassDescriptor>,
	run: RunContext,
	inputs: SizingInputs,
): Array<PassPlan> {
	const multiPass = descriptors.length > 1;
	return descriptors.map((descriptor) => sizePass(descriptor, { ...inputs, multiPass, run }));
}

/**
 * Dirty count for a real run: clear the cache wholesale when stale, then fold
 * TS builder invalidation in, reusing a single loaded cache for the dirty query
 * and the surgical entry removal.
 *
 * @param descriptor - The pass being sized.
 * @param cacheLocation - The resolved cache file path.
 * @param targetFiles - The candidate files for this pass.
 * @param context - The shared sizing inputs.
 * @returns The number of dirty files.
 */
function mutatingDirtyCount(
	descriptor: PassDescriptor,
	cacheLocation: string,
	targetFiles: Array<string>,
	{ clearedCaches, run }: SizePassContext,
): number {
	if (clearedCaches.has(cacheLocation)) {
		// The up-front sweep already deleted this pass's cache (see `plan`), so
		// every file is dirty and the builder would be pure waste — everything
		// re-lints.
		return targetFiles.length;
	}

	const cache: DirtyCache | undefined = openCache(cacheLocation, run.ci);
	const dirty = new Set(
		(cache?.getUpdatedFiles(targetFiles) ?? targetFiles).map((file) => normalizePath(file)),
	);

	if (descriptor.invalidation !== "none") {
		const outcome = applyTypeAwareInvalidation(run, {
			alreadyDirty: dirty,
			cache,
			cacheLocation,
			mode: descriptor.invalidation === "only" ? "only" : undefined,
			targetFiles,
		});
		if (outcome.busted) {
			return targetFiles.length;
		}

		for (const file of outcome.invalidated) {
			dirty.add(file);
		}
	}

	return dirty.size;
}

/**
 * Dirty count for `--print`: reflect cache staleness but never delete it, and
 * never run the builder. Only the mtime/checksum-dirty files count.
 *
 * @param cacheLocation - The resolved cache file path.
 * @param targetFiles - The candidate files for this pass.
 * @param context - The shared sizing inputs.
 * @returns The number of dirty files.
 */
function readOnlyDirtyCount(
	cacheLocation: string,
	targetFiles: Array<string>,
	{ newestBustMtime, run }: SizePassContext,
): number {
	if (isCacheStale(cacheLocation, newestBustMtime)) {
		return targetFiles.length;
	}

	const cache = openCache(cacheLocation, run.ci);
	return (cache?.getUpdatedFiles(targetFiles) ?? targetFiles).length;
}

/**
 * Count the files a pass will re-lint. Routes on `mutate`: the mutating path
 * clears stale caches and folds builder invalidation into the count (reusing
 * one loaded cache for the dirty query and the surgical removal); the read-only
 * path only reports the mtime/checksum-dirty files.
 *
 * @param descriptor - The pass being sized.
 * @param cacheFile - The pass's keyed cache file name.
 * @param context - The shared sizing inputs.
 * @returns The number of dirty files.
 */
function passDirtyCount(
	descriptor: PassDescriptor,
	cacheFile: string,
	context: SizePassContext,
): number {
	const targetFiles = descriptor.typeAwareOnly ? context.files.typeAware : context.files.lintable;
	if (!context.options.cache) {
		return targetFiles.length;
	}

	const cacheLocation = path.resolve(context.run.cwd, cacheFile);
	return context.run.mutate
		? mutatingDirtyCount(descriptor, cacheLocation, targetFiles, context)
		: readOnlyDirtyCount(cacheLocation, targetFiles, context);
}

/**
 * Size one pass: count its dirty files, resolve concurrency and decide whether
 * it runs. The default-mode type-aware pass is skipped when nothing
 * type-relevant is dirty; an explicit single-pass mode never skips.
 *
 * @param descriptor - The pass being sized.
 * @param context - The shared sizing inputs.
 * @returns The planned pass.
 */
function sizePass(descriptor: PassDescriptor, context: SizePassContext): PassPlan {
	const cacheFile = cacheFileFor(descriptor.cacheFileBase, context.run.key);
	const dirtyCount = passDirtyCount(descriptor, cacheFile, context);
	const conservative = context.files.targetsOutsideCwd;
	const filesPerWorker = descriptor.filesPerWorker(context.limits, context.run.environment);
	const maxWorkers = maxWorkersFor(descriptor, context.limits);

	// Outside-cwd targets are absent from the cwd-relative listing, so the dirty
	// count under-counts them — size for the worker cap instead (maxWorkers *
	// filesPerWorker ceils back to exactly maxWorkers).
	const sizingDirtyCount = conservative ? maxWorkers * filesPerWorker : dirtyCount;

	const concurrency =
		context.options.concurrency ??
		computeWorkerCount({ dirtyCount: sizingDirtyCount, filesPerWorker, maxWorkers });

	// The typed pass may only auto-skip when the dirty count is trustworthy; an
	// outside-cwd target makes it unknowable, so never skip in that case.
	//
	// A config change reaching the resolved config through a module the
	// `eslint.config.*` imports busts this variant's caches up front (see
	// `applyConfigDriftBust` in `plan`), so the dirty count reflects it and the
	// pass is not wrongly skipped. Residual escape hatch for the cases that
	// misses (dynamic `import()`, non-file config inputs): touch the config, or
	// run with `--no-cache`.
	const canSkip =
		context.run.mutate && context.multiPass && descriptor === TYPED_PASS && !conservative;
	if (canSkip && dirtyCount === 0) {
		return {
			cacheFile,
			concurrency,
			descriptor,
			shouldRun: false,
			skipReason: TYPED_SKIP_NOTICE,
		};
	}

	return { cacheFile, concurrency, descriptor, shouldRun: true, skipReason: undefined };
}
