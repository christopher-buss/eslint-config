import os from "node:os";
import process from "node:process";
import v8 from "node:v8";

import { parseBoundedInteger } from "../cli/parse.ts";
import type { ToolLabel } from "../cli/types.ts";

/**
 * Environment variable that sets the heap of a program-building ESLint child.
 */
export const HEAP_ENV = "LINT_TYPED_HEAP_MB";

/**
 * Share of the machine's memory the program-building workers may claim between
 * them. The rest is left for the oxlint child, the fast pass, the editor and
 * the OS, all of which run alongside the type-aware pass locally.
 */
export const HEAP_BUDGET_SHARE = 0.5;

/**
 * The least heap `auto` gives each program-building worker, as a multiple of
 * Node's default. Every worker loads the program of every project its files
 * touch, and files are handed out interleaved, so each one ends up holding
 * nearly all of them. Measured on a 5,400-file roblox-ts workspace: about
 * 3.3 GB of programs per worker plus about 1.3 MB per file, so 940 files per
 * worker peaked near 4.8 GB, just over the default. Fewer, larger workers fit
 * a budget far better than more, smaller ones: half the workers cut the total
 * by a third.
 */
export const AUTO_HEAP_FLOOR = 2;

const BYTES_PER_MB = 1024 * 1024;

const MAX_OLD_SPACE = /--max[-_]old[-_]space[-_]size\b/;

/** What the machine offers, as the heap plan sees it. */
export interface MemoryFacts {
	/**
	 * Memory the process may use in MB: the total, or the cgroup limit when one
	 * is lower (containers, CI).
	 */
	availableMb: number;
	/** V8's default heap limit for a process on this machine, in MB. */
	defaultHeapMb: number;
}

/**
 * How the run sets the heap of its program-building ESLint children, resolved
 * from {@link HEAP_ENV} and `NODE_OPTIONS`.
 *
 * - `auto` (the default) sizes the heap from the memory budget;
 * - `fixed` gives every worker the requested size;
 * - `off` leaves Node's default alone;
 * - `inherited` is a `--max-old-space-size` the user already put in
 *   `NODE_OPTIONS`. It wins over {@link HEAP_ENV}: the runner neither adds a
 *   second value nor changes the worker count for it.
 */
export type HeapSetting =
	| { kind: "auto" }
	| { kind: "fixed"; mb: number }
	| { kind: "inherited" }
	| { kind: "off" };

/** What a program-building pass was sized to, as its heap plan needs it. */
export interface HeapSizing {
	/** The pass's resolved concurrency (`off` lints on the main thread). */
	concurrency: "off" | number;
	/** The number of files the pass will lint. */
	dirtyCount: number;
}

/** The heap a program-building child runs with. */
export interface PassHeap {
	/**
	 * The `NODE_OPTIONS` the child runs under, carrying its heap flag.
	 * `undefined` leaves the inherited value alone.
	 */
	nodeOptions: string | undefined;
	/** A stderr line naming the workers, files per worker and heap. */
	note: string;
	/**
	 * Whether the runner reads the child's stderr for an out-of-memory report
	 * and adds a hint. False under `off`, which keeps the child exactly as an
	 * unmanaged one: its stderr stays inherited when it runs alone.
	 */
	watch: boolean;
}

/** Everything sizing needs to give a program-building pass its heap. */
export interface HeapBudget {
	/** The machine's memory facts. */
	memory: MemoryFacts;
	/** The inherited `NODE_OPTIONS` the flag is appended to. */
	nodeOptions: string | undefined;
	/** The resolved setting. */
	setting: HeapSetting;
}

/**
 * Read the machine's memory facts.
 *
 * @returns The available memory and V8's default heap limit, in MB.
 */
export function probeMemory(): MemoryFacts {
	const total = os.totalmem();
	const constrained = process.constrainedMemory();
	const available = constrained > 0 ? Math.min(total, constrained) : total;

	return {
		availableMb: Math.floor(available / BYTES_PER_MB),
		defaultHeapMb: Math.floor(v8.getHeapStatistics().heap_size_limit / BYTES_PER_MB),
	};
}

/**
 * Resolve the heap setting from the environment. An invalid {@link HEAP_ENV}
 * falls back to `auto`, as the other numeric knobs fall back to their
 * defaults.
 *
 * @param environment - Where {@link HEAP_ENV} and `NODE_OPTIONS` are read.
 * @returns Which of the four modes applies, with its size when fixed.
 */
export function resolveHeapSetting(environment: NodeJS.ProcessEnv): HeapSetting {
	if (MAX_OLD_SPACE.test(environment["NODE_OPTIONS"] ?? "")) {
		return { kind: "inherited" };
	}

	const raw = environment[HEAP_ENV]?.trim();
	if (raw === "off") {
		return { kind: "off" };
	}

	const mb = parseBoundedInteger(raw, 1);
	return mb === undefined ? { kind: "auto" } : { kind: "fixed", mb };
}

/**
 * The memory all program-building workers may claim together, in MB.
 *
 * @param memory - What the machine offers.
 * @returns The budget share of the available memory, in MB.
 */
export function heapBudgetMb(memory: MemoryFacts): number {
	return Math.floor(memory.availableMb * HEAP_BUDGET_SHARE);
}

/**
 * The most program-building workers the budget can hold, or `undefined` when
 * the setting places no limit. Each worker is counted at the heap it may grow
 * to: the requested size, or {@link AUTO_HEAP_FLOOR} times Node's default
 * under `auto`. Never below one.
 *
 * @param budget - The setting and the machine it applies to.
 * @returns How many workers fit, if the setting limits them.
 */
export function heapWorkerCap({ memory, setting }: HeapBudget): number | undefined {
	if (setting.kind !== "auto" && setting.kind !== "fixed") {
		return undefined;
	}

	const perWorker =
		setting.kind === "fixed" ? setting.mb : memory.defaultHeapMb * AUTO_HEAP_FLOOR;
	return Math.max(1, Math.floor(heapBudgetMb(memory) / perWorker));
}

/**
 * The heap each worker of a program-building pass gets, or `undefined` for
 * Node's default. `auto` splits the budget across the workers and only raises
 * the limit: a share below the default adds no flag.
 *
 * @param budget - The setting and the machine it applies to.
 * @param concurrency - The pass's resolved concurrency (`off` lints on the
 *   main thread, which is one heap).
 * @returns The size in MB to pass to Node, if it should change.
 */
export function heapPerWorkerMb(
	{ memory, setting }: HeapBudget,
	concurrency: "off" | number,
): number | undefined {
	if (setting.kind === "fixed") {
		return setting.mb;
	}

	if (setting.kind !== "auto") {
		return undefined;
	}

	const share = Math.floor(heapBudgetMb(memory) / workerCount(concurrency));
	return share > memory.defaultHeapMb ? share : undefined;
}

/**
 * Pair the run's heap setting with the machine it applies to.
 *
 * @param environment - Where {@link HEAP_ENV} and `NODE_OPTIONS` are read.
 * @param memory - What the machine offers.
 * @returns Everything sizing needs to give a program-building pass its heap.
 */
export function resolveHeapBudget(environment: NodeJS.ProcessEnv, memory: MemoryFacts): HeapBudget {
	return {
		memory,
		nodeOptions: environment["NODE_OPTIONS"],
		setting: resolveHeapSetting(environment),
	};
}

/**
 * The worker cap of a program-building pass once the heap budget is applied.
 * An explicit `LINT_MAX_WORKERS` is never tightened.
 *
 * @param maxWorkers - The pass's cap before the budget.
 * @param explicit - Whether `LINT_MAX_WORKERS` set that cap.
 * @param budget - The setting and the machine it applies to.
 * @returns The cap to size the pass against.
 */
export function capWorkersForHeap(
	maxWorkers: number,
	explicit: boolean,
	budget: HeapBudget,
): number {
	const cap = explicit ? undefined : heapWorkerCap(budget);
	return cap === undefined ? maxWorkers : Math.min(maxWorkers, cap);
}

/**
 * Plan the heap of one program-building child from its sizing.
 *
 * @param label - The child's label, for the `--print` line.
 * @param budget - The setting and the machine it applies to.
 * @param sizing - The child's concurrency and file count.
 * @returns Its `NODE_OPTIONS`, its `--print` line and whether it is watched.
 */
export function planPassHeap(label: ToolLabel, budget: HeapBudget, sizing: HeapSizing): PassHeap {
	const heapMb = heapPerWorkerMb(budget, sizing.concurrency);
	return {
		nodeOptions: heapNodeOptions(budget, heapMb),
		note: describeHeapPlan(label, budget, sizing, heapMb),
		watch: budget.setting.kind !== "off",
	};
}

/**
 * The number of heaps a concurrency value runs: `off` lints on the main
 * thread, which is one.
 *
 * @param concurrency - A resolved ESLint concurrency.
 * @returns How many threads lint.
 */
function workerCount(concurrency: "off" | number): number {
	return concurrency === "off" ? 1 : concurrency;
}

/**
 * The `NODE_OPTIONS` a program-building child runs under: the inherited value
 * with the heap flag appended. Node's `worker_threads` take their heap limit
 * from `--max-old-space-size` when it is set, so this one flag reaches every
 * ESLint worker.
 *
 * @param budget - Carries the inherited `NODE_OPTIONS`.
 * @param heapMb - The size in MB for each worker, if it should change.
 * @returns The value to set, or `undefined` to leave `NODE_OPTIONS` alone.
 */
function heapNodeOptions(
	{ nodeOptions }: HeapBudget,
	heapMb: number | undefined,
): string | undefined {
	if (heapMb === undefined) {
		return undefined;
	}

	const flag = `--max-old-space-size=${String(heapMb)}`;
	const inherited = nodeOptions?.trim() ?? "";
	return inherited.length > 0 ? `${inherited} ${flag}` : flag;
}

/**
 * How the `--print` line names a heap the runner left alone.
 *
 * @param budget - Says whether the user's `NODE_OPTIONS` set it.
 * @returns The user's heap, or Node's default with its size.
 */
function unchangedHeap({ memory, setting }: HeapBudget): string {
	return setting.kind === "inherited"
		? "the NODE_OPTIONS heap"
		: `Node's default heap (${String(memory.defaultHeapMb)} MB)`;
}

/**
 * Describe the memory plan of a program-building pass for `--print`.
 *
 * @param label - The pass's child label.
 * @param budget - The setting and the machine it applies to.
 * @param sizing - The pass's concurrency and file count.
 * @param heapMb - The size given to each worker, if it changed.
 * @returns One stderr line naming the workers, files per worker and heap.
 */
function describeHeapPlan(
	label: ToolLabel,
	budget: HeapBudget,
	{ concurrency, dirtyCount }: HeapSizing,
	heapMb: number | undefined,
): string {
	const workers = workerCount(concurrency);
	const heap = heapMb === undefined ? unchangedHeap(budget) : `${String(heapMb)} MB heap`;
	const source = {
		auto: `auto, budget ${String(heapBudgetMb(budget.memory))} MB`,
		fixed: HEAP_ENV,
		inherited: "NODE_OPTIONS",
		off: `${HEAP_ENV}=off`,
	}[budget.setting.kind];

	return (
		`isentinel-lint: ${label} pass: ${String(workers)} worker(s), ` +
		`~${String(Math.ceil(dirtyCount / workers))} files per worker, ${heap} per worker ` +
		`(${source}).\n`
	);
}
