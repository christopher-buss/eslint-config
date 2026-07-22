// cspell:words typeaware
import { CACHE_FILE_DEFAULT, CACHE_FILE_FAST, CACHE_FILE_TYPE_AWARE } from "../cache/constants.ts";
import type { LintCliOptions, ToolLabel, TypeAwareMode } from "../cli/types.ts";
import { resolveFastFilesPerWorker } from "./concurrency.ts";
import type { WorkerLimits } from "./concurrency.ts";

/**
 * The invariant tuple describing one ESLint pass: its cache file, the
 * `ESLINT_TYPE_AWARE` value it runs under, whether (and how) it folds TS
 * builder invalidation into its dirty count, the extension family it sizes
 * from, and how it resolves its files-per-worker. Restated nowhere else — the
 * mode branches just pick descriptors.
 */
export interface PassDescriptor {
	/**
	 * Base name of the ESLint cache this pass reads and writes. The real file
	 * name adds the run's config-variant key; see `cacheFileFor`.
	 */
	cacheFileBase: string;
	/**
	 * Resolve the files-per-worker for this pass from the shared limits and the
	 * environment. The fast pass uses its own higher break-even.
	 *
	 * @param limits - The shared worker limits.
	 * @param environment - The process environment (for overrides).
	 * @returns The files-per-worker for this pass.
	 */
	filesPerWorker: (limits: WorkerLimits, environment: NodeJS.ProcessEnv) => number;
	/**
	 * How the pass folds TS builder invalidation into its dirty count: `"none"`
	 * runs no builder (the syntactic fast pass); `"only"`/`"full"` run it.
	 */
	invalidation: "full" | "none" | "only";
	/** `concurrently` prefix / ESLint child label. */
	label: ToolLabel;
	/**
	 * Value for the child's `ESLINT_TYPE_AWARE`, moving in lockstep with the
	 * label. `undefined` leaves it unset (the full config).
	 */
	typeAwareEnv: TypeAwareMode | undefined;
	/** When true, size from TS/JS-family files only (the typed pass). */
	typeAwareOnly: boolean;
}

/**
 * The syntactic-only fast pass (`ESLINT_TYPE_AWARE=off`, `.eslintcache-fast`).
 */
export const FAST_PASS: PassDescriptor = {
	cacheFileBase: CACHE_FILE_FAST,
	filesPerWorker: (_limits, environment) => resolveFastFilesPerWorker(environment),
	invalidation: "none",
	label: "fast",
	typeAwareEnv: "off",
	typeAwareOnly: false,
};

/** The type-aware pass (`ESLINT_TYPE_AWARE=only`, `.eslintcache-typeaware`). */
export const TYPED_PASS: PassDescriptor = {
	cacheFileBase: CACHE_FILE_TYPE_AWARE,
	filesPerWorker: (limits) => limits.filesPerWorker,
	invalidation: "only",
	label: "typed",
	typeAwareEnv: "only",
	typeAwareOnly: true,
};

/** The full-config pass (env unset, `.eslintcache`): CI, `--fix`, `=full`. */
export const FULL_PASS: PassDescriptor = {
	cacheFileBase: CACHE_FILE_DEFAULT,
	filesPerWorker: (limits) => limits.filesPerWorker,
	invalidation: "full",
	label: "eslint",
	typeAwareEnv: undefined,
	typeAwareOnly: false,
};

/**
 * Select the ESLint passes for the resolved mode. An explicit `--type-aware`
 * always wins: `=full` (and `--fix`) collapse to the single full pass, while
 * `=off`/`=only` run their one pass even in CI. Only when no mode is given does
 * CI change the default — collapsing the concurrent two-pass split to one full
 * pass; a local default run keeps the split (the typed pass may later be
 * skipped). CI's `--cache-strategy content` is applied by the command composer
 * to whichever pass runs, independently of this selection.
 *
 * @param options - The parsed CLI options.
 * @param ci - Whether the run is in CI.
 * @returns The pass descriptors to plan, in run order.
 */
export function selectPasses(options: LintCliOptions, ci: boolean): Array<PassDescriptor> {
	if (options.fix || options.typeAware === "full") {
		return [FULL_PASS];
	}

	if (options.typeAware === "off") {
		return [FAST_PASS];
	}

	if (options.typeAware === "only") {
		return [TYPED_PASS];
	}

	// No explicit selection: CI collapses the default split to one full pass.
	if (ci) {
		return [FULL_PASS];
	}

	return [FAST_PASS, TYPED_PASS];
}

/**
 * The worker cap for a pass. `invalidation` already records whether a pass
 * builds a TypeScript program — the fast pass runs no builder precisely because
 * it builds none — so it doubles as the cap selector rather than restating the
 * same fact per descriptor.
 *
 * @param descriptor - The pass being sized.
 * @param limits - The shared worker limits.
 * @returns The worker cap for this pass.
 */
export function maxWorkersFor(descriptor: PassDescriptor, limits: WorkerLimits): number {
	return descriptor.invalidation === "none" ? limits.maxWorkers : limits.typedMaxWorkers;
}
