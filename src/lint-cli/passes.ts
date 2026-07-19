// cspell:words typeaware
import { resolveFastFilesPerWorker } from "./concurrency.ts";
import type { WorkerLimits } from "./concurrency.ts";
import { CACHE_FILE_DEFAULT, CACHE_FILE_FAST, CACHE_FILE_TYPE_AWARE } from "./constants.ts";
import type { LintCliOptions, ToolLabel, TypeAwareMode } from "./types.ts";

/**
 * The invariant tuple describing one ESLint pass: its cache file, the
 * `ESLINT_TYPE_AWARE` value it runs under, whether (and how) it folds TS
 * builder invalidation into its dirty count, the extension family it sizes
 * from, and how it resolves its files-per-worker. Restated nowhere else — the
 * mode branches just pick descriptors.
 */
export interface PassDescriptor {
	/** ESLint cache file this pass reads and writes. */
	cacheFile: string;
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
	cacheFile: CACHE_FILE_FAST,
	filesPerWorker: (_limits, environment) => resolveFastFilesPerWorker(environment),
	invalidation: "none",
	label: "fast",
	typeAwareEnv: "off",
	typeAwareOnly: false,
};

/** The type-aware pass (`ESLINT_TYPE_AWARE=only`, `.eslintcache-typeaware`). */
export const TYPED_PASS: PassDescriptor = {
	cacheFile: CACHE_FILE_TYPE_AWARE,
	filesPerWorker: (limits) => limits.filesPerWorker,
	invalidation: "only",
	label: "typed",
	typeAwareEnv: "only",
	typeAwareOnly: true,
};

/** The full-config pass (env unset, `.eslintcache`): CI, `--fix`, `=full`. */
export const FULL_PASS: PassDescriptor = {
	cacheFile: CACHE_FILE_DEFAULT,
	filesPerWorker: (limits) => limits.filesPerWorker,
	invalidation: "full",
	label: "eslint",
	typeAwareEnv: undefined,
	typeAwareOnly: false,
};

/**
 * Select the ESLint passes for the resolved mode. CI, `--fix` and the explicit
 * `--type-aware=full` escape hatch collapse to the single full pass;
 * `--type-aware=off`/`=only` run their one pass; the default runs the fast and
 * type-aware passes concurrently (the typed one may later be skipped).
 *
 * @param options - The parsed CLI options.
 * @param ci - Whether the run is in CI.
 * @returns The pass descriptors to plan, in run order.
 */
export function selectPasses(options: LintCliOptions, ci: boolean): Array<PassDescriptor> {
	if (ci || options.fix || options.typeAware === "full") {
		return [FULL_PASS];
	}

	if (options.typeAware === "off") {
		return [FAST_PASS];
	}

	if (options.typeAware === "only") {
		return [TYPED_PASS];
	}

	return [FAST_PASS, TYPED_PASS];
}
