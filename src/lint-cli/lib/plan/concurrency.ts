import { parseBoundedInteger } from "../cli/parse.ts";

/** Default number of files a single ESLint worker should handle. */
export const DEFAULT_FILES_PER_WORKER = 300;

/**
 * Absolute worker cap for the passes that build a TypeScript program. Measured
 * on a 32-thread / 16-core machine against a 3191-file type-aware run: 4-6
 * workers all land at ~37-40s, then 8 workers regress to ~51s — concurrent
 * program builds saturate memory bandwidth well before they saturate cores.
 * Applies on top of the shared worker cap, and only bites on machines
 * with 28 or more threads; an explicit `LINT_MAX_WORKERS` overrides it.
 */
export const TYPED_MAX_WORKERS = 6;

/**
 * Default files-per-worker for the fast (`--type-aware=off`) pass. A syntactic
 * lint costs ~15ms/file against a fixed ~3s config-load per worker, so the
 * break-even against spinning up another worker sits far higher than the
 * type-aware pass — roughly 800 files. Overridable via `FAST_FILES_PER_WORKER`.
 */
export const DEFAULT_FAST_FILES_PER_WORKER = 800;

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
	/** The cap for a pass that builds no TypeScript program (the fast pass). */
	maxWorkers: number;
	/**
	 * The cap for a pass that builds one: tighter, because concurrent program
	 * builds saturate memory bandwidth before they saturate cores (see
	 * {@link TYPED_MAX_WORKERS}). Both caps collapse to an explicit
	 * `LINT_MAX_WORKERS`, which is a deliberate request and is never tightened.
	 */
	typedMaxWorkers: number;
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
	const maxWorkers = explicit ?? Math.floor(availableParallelism / 4);

	return {
		filesPerWorker,
		maxWorkers,
		typedMaxWorkers: explicit ?? Math.min(maxWorkers, TYPED_MAX_WORKERS),
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
