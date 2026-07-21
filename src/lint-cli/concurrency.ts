import { DEFAULT_FAST_FILES_PER_WORKER, DEFAULT_FILES_PER_WORKER } from "./constants.ts";
import { parseBoundedInteger } from "./parse.ts";

/** Inputs to the (pure) worker-count heuristic. */
export interface WorkerHeuristicInput {
	/** Number of files ESLint will actually re-lint. */
	dirtyCount: number;
	/** Target files handled by a single worker before adding another. */
	filesPerWorker: number;
	/** Upper bound on worker count. */
	maxWorkers: number;
}

/** Resolved limits derived from the environment and available CPUs. */
export interface WorkerLimits {
	/**
	 * Whether `maxWorkers` came from an explicit `LINT_MAX_WORKERS`. A pass may
	 * tighten the derived cap (see `TYPED_MAX_WORKERS`) but never an explicit
	 * one.
	 */
	explicitMaxWorkers: boolean;
	filesPerWorker: number;
	maxWorkers: number;
}

/**
 * Derive the worker limits from environment overrides, falling back to the
 * default files-per-worker and a quarter of the available parallelism.
 *
 * A type-aware worker costs a fixed TypeScript program build plus roughly
 * 10-20ms per file. The build is not a constant: `projectService` only builds
 * the projects covering the files a worker was given, so splitting the run
 * splits the build too — but each split still repeats the per-project floor,
 * which is what keeps the sweet spot near 300 files per worker rather than
 * ESLint's syntax-tuned `auto`.
 *
 * @param environment - The environment variables to read overrides from.
 * @param availableParallelism - The number of available CPUs.
 * @returns The resolved worker limits.
 */
export function resolveWorkerLimits(
	environment: NodeJS.ProcessEnv,
	availableParallelism: number,
): WorkerLimits {
	const filesPerWorker =
		parsePositiveInteger(environment["FILES_PER_WORKER"]) ?? DEFAULT_FILES_PER_WORKER;
	const explicit = parsePositiveInteger(environment["LINT_MAX_WORKERS"]);

	return {
		explicitMaxWorkers: explicit !== undefined,
		filesPerWorker,
		maxWorkers: explicit ?? Math.floor(availableParallelism / 4),
	};
}

/**
 * Resolve the fast pass's files-per-worker, honouring the
 * `FAST_FILES_PER_WORKER` override. The fast pass lints each file syntactically
 * in isolation, so its break-even worker size is far higher than the type-aware
 * pass (see {@link DEFAULT_FAST_FILES_PER_WORKER}).
 *
 * @param environment - The environment variables to read the override from.
 * @returns The resolved fast-pass files-per-worker.
 */
export function resolveFastFilesPerWorker(environment: NodeJS.ProcessEnv): number {
	return (
		parsePositiveInteger(environment["FAST_FILES_PER_WORKER"]) ?? DEFAULT_FAST_FILES_PER_WORKER
	);
}

/**
 * Compute ESLint's `--concurrency` value. Returns `"off"` when a single worker
 * (or fewer) would be used, since parallelism only pays off past that point.
 *
 * @param input - The dirty count and worker limits.
 * @returns The worker count, or `"off"` to disable parallelism.
 */
export function computeWorkerCount({
	dirtyCount,
	filesPerWorker,
	maxWorkers,
}: WorkerHeuristicInput): "off" | number {
	if (dirtyCount <= 0 || filesPerWorker <= 0 || maxWorkers <= 0) {
		return "off";
	}

	const workers = Math.min(Math.ceil(dirtyCount / filesPerWorker), maxWorkers);
	if (workers < 2) {
		return "off";
	}

	return workers;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
	return parseBoundedInteger(value, 1);
}
