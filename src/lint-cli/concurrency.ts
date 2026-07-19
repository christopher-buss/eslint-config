import { DEFAULT_FILES_PER_WORKER } from "./constants.ts";

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
	filesPerWorker: number;
	maxWorkers: number;
}

/**
 * Derive the worker limits from environment overrides, falling back to the
 * default files-per-worker and a quarter of the available parallelism.
 *
 * Type-aware linting spends roughly `filesPerWorker^1.46` per worker with a
 * fixed ~6.5s TypeScript program construction cost, so the sweet spot is
 * ~200-400 files per worker rather than ESLint's syntax-tuned `auto`.
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
	const maxWorkers =
		parsePositiveInteger(environment["LINT_MAX_WORKERS"]) ??
		Math.floor(availableParallelism / 4);

	return { filesPerWorker, maxWorkers };
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
	if (value === undefined) {
		return undefined;
	}

	const parsed = Number(value.trim());
	if (!Number.isInteger(parsed) || parsed < 1) {
		return undefined;
	}

	return parsed;
}
