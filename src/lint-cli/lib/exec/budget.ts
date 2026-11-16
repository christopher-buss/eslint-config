import type {
	Lease,
	MachineBudget,
	MachineBudgetOptions,
	TreeWatch,
} from "@isentinel/machine-budget";

import path from "node:path";

import type { ChildCommand } from "../cli/types.ts";
import { findWorkspaceRoot } from "../files/workspace.ts";
import { toPosix } from "../paths.ts";

const BYTES_PER_MB = 1024 * 1024;

/** Prints one line of the budget's own output, such as why a lease waits. */
export type BudgetLog = (line: string) => void;

/** The parts of `@isentinel/machine-budget` the runner calls. */
export interface BudgetModule {
	openMachineBudget: (options: MachineBudgetOptions) => MachineBudget;
	watchTree: (pid: number) => TreeWatch;
}

/** An open machine budget and the tree watch that measures its children. */
export interface BudgetBackend {
	budget: Pick<MachineBudget, "close" | "leaseAsync">;
	watchTree: (pid: number) => TreeWatch;
}

/**
 * What one child holds of the machine budget, from before its spawn to its
 * exit.
 */
export interface ChildLease {
	/** The child to spawn, with the granted workers in its arguments. */
	command: ChildCommand;
	/**
	 * What the budget granted, for the line that announces the spawn.
	 * `undefined` when the child holds no lease.
	 */
	grant: string | undefined;
	/**
	 * Give the workers back, with the child's peak memory when it was
	 * measured. Safe to call more than once; only the first call counts.
	 */
	release: () => void;
	/**
	 * Start measuring the child's process tree. Call right after the spawn,
	 * with the child's pid (`undefined` when the spawn failed).
	 */
	watch: (pid: number | undefined) => void;
}

/** The machine budget as one run of the CLI sees it. */
export interface RunBudget {
	/** Leave the budget, giving back every lease the run still holds. */
	close: () => void;
	/**
	 * Lease what a child asks for, waiting while the machine is full. A child
	 * that asks for nothing gets a lease that holds nothing.
	 */
	lease: (command: ChildCommand) => Promise<ChildLease>;
}

/** A budget that leases nothing: every child runs as planned. */
export const UNBUDGETED = createRunBudget(undefined, ".");

/**
 * Start a child with the workers the budget granted: rewrite the engine flag
 * its demand names. ESLint runs one worker on the main thread (`off`). A flag
 * the planner did not compose is put in front.
 *
 * @param command - The planned child.
 * @param workers - The granted workers.
 * @returns The child to spawn.
 */
export function applyGrant(command: ChildCommand, workers: number): ChildCommand {
	const { workers: demand } = command;
	if (demand === undefined) {
		return command;
	}

	const value = demand.flag === "--concurrency" && workers < 2 ? "off" : String(workers);
	const index = command.args.indexOf(demand.flag);
	const args =
		index === -1 ? [demand.flag, value, ...command.args] : command.args.with(index + 1, value);

	return { ...command, args };
}

/**
 * Wrap an open machine budget for one run.
 *
 * Each lease asks for the planned workers at most and one at least, so a busy
 * machine slows the run down rather than stopping it. The cost is learned per
 * pass and project. A lease that fails (a ledger error, say) runs the child
 * as planned: the budget is a courtesy to the rest of the machine and must
 * never fail a lint.
 *
 * @param backend - The open budget and the tree watch; `undefined` leases
 *   nothing.
 * @param project - The lint target relative to the workspace root.
 * @param log - Where a failed lease is reported.
 * @returns A budget that leases each child's workers before its spawn.
 */
export function createRunBudget(
	backend: BudgetBackend | undefined,
	project: string,
	log: BudgetLog = doNothing,
): RunBudget {
	let isClosed = false;
	return {
		close: () => {
			isClosed = true;
			backend?.budget.close();
		},
		lease: async (command) => {
			const { workers: demand } = command;
			if (backend === undefined || demand === undefined) {
				return withoutLease(command);
			}

			let lease: Lease;
			try {
				lease = await backend.budget.leaseAsync({
					...(demand.pass === undefined ? {} : { cost: { pass: demand.pass, project } }),
					maxWorkers: demand.maxWorkers,
					memoryPerWorker: demand.memoryPerWorkerMb * BYTES_PER_MB,
					minWorkers: 1,
				});
			} catch (err) {
				// A wait that a cancel gave up ends when the run closes the
				// budget; that is no failure to report.
				if (!isClosed) {
					log(
						`machine budget failed to lease (${errorMessage(err)}); running unbudgeted`,
					);
				}

				return withoutLease(command);
			}

			return leased(command, lease, backend.watchTree);
		},
	};
}

/**
 * Join the machine budget for one run of the CLI. The package is loaded on
 * first use, so `--help` and `--print` never pay for it; when it cannot load
 * or open its ledger, the run goes on unbudgeted. `MACHINE_BUDGET=off`, or CI,
 * makes the package grant every request in full.
 *
 * @param cwd - The working directory: the lint target.
 * @param log - Prints the budget's lines, such as why a lease waits.
 * @param load - Loads the package (injected in tests).
 * @returns The open budget, or {@link UNBUDGETED} when it cannot open.
 */
export async function openRunBudget(
	cwd: string,
	log: BudgetLog,
	load: () => Promise<BudgetModule> = async () => import("@isentinel/machine-budget"),
): Promise<RunBudget> {
	const workspaceRoot = findWorkspaceRoot(cwd);
	try {
		const module = await load();
		const budget = module.openMachineBudget({ log, workspaceRoot });
		const project = toPosix(path.relative(workspaceRoot, cwd)) || ".";
		return createRunBudget({ budget, watchTree: module.watchTree }, project, log);
	} catch (err) {
		log(`machine budget unavailable (${errorMessage(err)}); running unbudgeted`);
		return UNBUDGETED;
	}
}

function doNothing(): void {
	// Nothing to do: the budget is off, or the child holds no lease.
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function withoutLease(command: ChildCommand): ChildLease {
	return { command, grant: undefined, release: doNothing, watch: doNothing };
}

/**
 * A child's hold on a granted lease.
 *
 * The release reports only the tree's total peak. ESLint and oxlint run their
 * workers as threads of one process, so the biggest process of the tree is the
 * whole child, not one worker; the budget divides the total by the workers
 * instead. A child with no cost pass is not measured: its release teaches the
 * budget nothing.
 *
 * @param planned - The planned child.
 * @param lease - The granted lease.
 * @param watchTree - Starts a tree watch.
 * @returns The child's lease.
 */
function leased(
	planned: ChildCommand,
	lease: Lease,
	watchTree: (pid: number) => TreeWatch,
): ChildLease {
	const unit = planned.workers?.flag === "--threads" ? "threads" : "workers";
	const isLearned = planned.workers?.pass !== undefined;
	let tree: TreeWatch | undefined;
	let released = false;

	return {
		command: applyGrant(planned, lease.workers),
		grant: `budget: ${String(lease.workers)} of ${String(planned.workers?.maxWorkers)} ${unit}`,
		release: () => {
			if (released) {
				return;
			}

			released = true;
			const peakMemory = tree?.stop().peakMemory;
			lease.release(peakMemory === undefined ? undefined : { peakMemory });
		},
		watch: (pid) => {
			if (isLearned && pid !== undefined && !released) {
				tree = watchTree(pid);
			}
		},
	};
}
