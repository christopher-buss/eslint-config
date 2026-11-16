import type { Lease, LeaseReport, LeaseRequest, TreePeaks } from "@isentinel/machine-budget";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { TestContext } from "vitest";
import { describe, it, vi } from "vitest";

import type {
	ChildCommand,
	ComposeContext,
	LintCliOptions,
	WorkerDemand,
} from "../src/lint-cli/lib/cli/types.ts";
import type { BudgetBackend, ChildLease, RunBudget } from "../src/lint-cli/lib/exec/budget.ts";
import {
	applyGrant,
	createRunBudget,
	openRunBudget,
	UNBUDGETED,
} from "../src/lint-cli/lib/exec/budget.ts";
import { execute, resetCancellation } from "../src/lint-cli/lib/exec/execute.ts";
import { composeEslintCommand, composeOxlintCommand } from "../src/lint-cli/lib/plan/command.ts";
import {
	FAST_WORKER_MEMORY_MB,
	OXLINT_THREAD_MEMORY_MB,
	PROGRAM_WORKER_MEMORY_MB,
	resolveOxlintThreads,
} from "../src/lint-cli/lib/plan/concurrency.ts";
import type { PassHeap } from "../src/lint-cli/lib/plan/heap.ts";

const MIB = 1024 * 1024;

/** What the fake budget recorded. */
interface FakeRecord {
	closed: number;
	releases: Array<LeaseReport | undefined>;
	requests: Array<LeaseRequest>;
	watched: Array<number>;
}

interface FakeOptions {
	/** The workers the fake grants; defaults to the request's maximum. */
	grant?: (request: LeaseRequest) => number;
	/** The peaks the fake tree watch reports. */
	peaks?: TreePeaks;
	/** Makes `leaseAsync` reject. */
	reject?: Error;
}

function fakeBackend(fake: FakeOptions = {}): { backend: BudgetBackend; record: FakeRecord } {
	const record: FakeRecord = { closed: 0, releases: [], requests: [], watched: [] };
	const peaks = fake.peaks ?? { peakMemory: 900 * MIB, peakPerWorker: 300 * MIB };
	const backend: BudgetBackend = {
		budget: {
			close: () => {
				record.closed += 1;
			},
			leaseAsync: async (request) => {
				record.requests.push(request);
				if (fake.reject !== undefined) {
					throw fake.reject;
				}

				const lease: Lease = {
					memoryPerWorker: request.memoryPerWorker,
					release: (report) => {
						record.releases.push(report);
					},
					workers: fake.grant?.(request) ?? request.maxWorkers,
				};
				return lease;
			},
		},
		watchTree: (pid) => {
			record.watched.push(pid);
			return { stop: () => peaks };
		},
	};

	return { backend, record };
}

function demand(overrides: Partial<WorkerDemand> = {}): WorkerDemand {
	return {
		flag: "--concurrency",
		maxWorkers: 4,
		memoryPerWorkerMb: 512,
		pass: "eslint-fast",
		...overrides,
	};
}

function eslintChild(workers: WorkerDemand = demand()): ChildCommand {
	return {
		args: ["--cache", "--no-warn-ignored", "--concurrency", "4", "src"],
		bin: "eslint",
		env: {},
		label: "fast",
		watchHeap: false,
		workers,
	};
}

function options(overrides: Partial<LintCliOptions> = {}): LintCliOptions {
	return {
		agents: false,
		cache: true,
		concurrency: undefined,
		eslint: false,
		eslintArgs: [],
		filesFrom: undefined,
		fix: false,
		oxfmt: true,
		oxlint: false,
		oxlintArgs: [],
		oxlintTypeAware: true,
		paths: ["."],
		print: false,
		typeAware: undefined,
		...overrides,
	};
}

function baseContext(overrides: Partial<ComposeContext> = {}): ComposeContext {
	return {
		agentsFormatterPath: "/dist/formatter-agents.mjs",
		cacheLocation: ".eslintcache",
		ci: false,
		concurrency: "off",
		eslintLabel: "eslint",
		fix: false,
		heap: undefined,
		paths: ["."],
		typeAwareEnv: undefined,
		...overrides,
	};
}

describe("applyGrant", () => {
	it("replaces the planned ESLint concurrency with the granted workers", ({ expect }) => {
		expect.assertions(1);

		expect(applyGrant(eslintChild(), 3).args).toStrictEqual([
			"--cache",
			"--no-warn-ignored",
			"--concurrency",
			"3",
			"src",
		]);
	});

	it("runs ESLint on the main thread when one worker is granted", ({ expect }) => {
		expect.assertions(1);

		expect(applyGrant(eslintChild(), 1).args).toContain("off");
	});

	it("adds the granted thread count to oxlint", ({ expect }) => {
		expect.assertions(1);

		const oxlint: ChildCommand = {
			args: ["--no-error-on-unmatched-pattern", "."],
			bin: "oxlint",
			env: {},
			label: "oxc",
			watchHeap: false,
			workers: demand({ flag: "--threads", pass: undefined }),
		};

		expect(applyGrant(oxlint, 2).args).toStrictEqual([
			"--threads",
			"2",
			"--no-error-on-unmatched-pattern",
			".",
		]);
	});
});

describe("createRunBudget", () => {
	it("leases nothing for a child without a worker demand", async ({ expect }) => {
		expect.assertions(3);

		const { backend, record } = fakeBackend();
		const child: ChildCommand = { ...eslintChild(), workers: undefined };
		const lease = await createRunBudget(backend, "app").lease(child);

		expect(lease.command).toBe(child);
		expect(lease.grant).toBeUndefined();
		expect(record.requests).toStrictEqual([]);
	});

	it("leases each child under its pass and project", async ({ expect }) => {
		expect.assertions(1);

		const { backend, record } = fakeBackend();
		await createRunBudget(backend, "packages/app").lease(eslintChild());

		expect(record.requests).toStrictEqual([
			{
				cost: { pass: "eslint-fast", project: "packages/app" },
				maxWorkers: 4,
				memoryPerWorker: 512 * MIB,
				minWorkers: 1,
			},
		]);
	});

	// oxlint's memory does not grow with its threads: most of it is the
	// type-aware backend. A cost learned per thread would scale a whole run's
	// peak by the thread count on the next lease.
	it("leases a child with no cost pass without a cost or a report", async ({ expect }) => {
		expect.assertions(3);

		const { backend, record } = fakeBackend();
		const lease = await createRunBudget(backend, "app").lease(
			eslintChild(demand({ flag: "--threads", pass: undefined })),
		);
		lease.watch(4242);
		lease.release();

		expect(record.requests[0]).not.toHaveProperty("cost");
		expect(record.watched).toStrictEqual([]);
		expect(record.releases).toStrictEqual([undefined]);
	});

	it("starts the child with the workers the budget granted", async ({ expect }) => {
		expect.assertions(2);

		const { backend } = fakeBackend({ grant: () => 2 });
		const lease = await createRunBudget(backend, "app").lease(eslintChild());

		expect(lease.command.args).toContain("2");
		expect(lease.grant).toBe("budget: 2 of 4 workers");
	});

	it("releases with the tree's peak memory", async ({ expect }) => {
		expect.assertions(2);

		const { backend, record } = fakeBackend();
		const lease = await createRunBudget(backend, "app").lease(eslintChild());
		lease.watch(4242);
		lease.release();

		expect(record.watched).toStrictEqual([4242]);
		// ESLint and oxlint run their workers as threads of one process, so the
		// biggest process is the whole child, not one worker: only the total
		// is reported.
		expect(record.releases).toStrictEqual([{ peakMemory: 900 * MIB }]);
	});

	it("releases with no report when the peak is unknown", async ({ expect }) => {
		expect.assertions(1);

		const { backend, record } = fakeBackend({
			peaks: { peakMemory: undefined, peakPerWorker: undefined },
		});
		const lease = await createRunBudget(backend, "app").lease(eslintChild());
		lease.watch(1);
		lease.release();

		expect(record.releases).toStrictEqual([undefined]);
	});

	it("releases with no report when the child never started", async ({ expect }) => {
		expect.assertions(2);

		const { backend, record } = fakeBackend();
		const lease = await createRunBudget(backend, "app").lease(eslintChild());
		lease.watch(undefined);
		lease.release();

		expect(record.watched).toStrictEqual([]);
		expect(record.releases).toStrictEqual([undefined]);
	});

	it("releases a lease only once", async ({ expect }) => {
		expect.assertions(1);

		const { backend, record } = fakeBackend();
		const lease = await createRunBudget(backend, "app").lease(eslintChild());
		lease.release();
		lease.release();

		expect(record.releases).toHaveLength(1);
	});

	it("runs the planned child when the budget fails to lease", async ({ expect }) => {
		expect.assertions(3);

		const { backend } = fakeBackend({ reject: new Error("ledger locked") });
		const lines: Array<string> = [];
		const child = eslintChild();
		const lease = await createRunBudget(backend, "app", (line) => {
			lines.push(line);
		}).lease(child);

		expect(lease.command).toBe(child);
		expect(lease.grant).toBeUndefined();
		expect(lines).toStrictEqual([
			"machine budget failed to lease (ledger locked); running unbudgeted",
		]);
	});

	it("reports no failure for a lease that ends after the budget closed", async ({ expect }) => {
		expect.assertions(2);

		const lines: Array<string> = [];
		const failed = Promise.withResolvers<Lease>();
		const { backend } = fakeBackend();
		backend.budget.leaseAsync = async () => failed.promise;

		const budget = createRunBudget(backend, ".", (line) => {
			lines.push(line);
		});

		const pending = budget.lease(eslintChild());
		budget.close();
		failed.reject(new Error("database is not open"));
		const lease = await pending;

		expect(lease.grant).toBeUndefined();
		expect(lines).toStrictEqual([]);
	});

	it("closes the budget", ({ expect }) => {
		expect.assertions(1);

		const { backend, record } = fakeBackend();
		createRunBudget(backend, "app").close();

		expect(record.closed).toBe(1);
	});
});

describe("openRunBudget", () => {
	it("runs unbudgeted when the package cannot load", async ({ expect }) => {
		expect.assertions(2);

		const lines: Array<string> = [];
		const budget = await openRunBudget(
			process.cwd(),
			(line) => {
				lines.push(line);
			},
			async () => {
				throw new Error("Cannot find module");
			},
		);

		expect(budget).toBe(UNBUDGETED);
		expect(lines).toStrictEqual([
			"machine budget unavailable (Cannot find module); running unbudgeted",
		]);
	});

	it("runs unbudgeted when the budget cannot open", async ({ expect }) => {
		expect.assertions(1);

		const budget = await openRunBudget(
			process.cwd(),
			() => {},
			async () => {
				return {
					openMachineBudget: () => {
						throw new Error("no sqlite");
					},
					watchTree: () => {
						return {
							stop: () => ({ peakMemory: undefined, peakPerWorker: undefined }),
						};
					},
				};
			},
		);

		expect(budget).toBe(UNBUDGETED);
	});

	it("opens the budget at the workspace root and names the project", async ({ expect }) => {
		expect.assertions(2);

		const roots: Array<string> = [];
		const { backend, record } = fakeBackend();
		const cwd = path.resolve("test");
		const budget = await openRunBudget(
			cwd,
			() => {},
			async () => {
				return {
					openMachineBudget: ({ workspaceRoot }) => {
						roots.push(workspaceRoot);
						return {
							...backend.budget,
							isShared: true,
							runCapWorkers: () => 0,
							tryLease: () => {},
						};
					},
					watchTree: backend.watchTree,
				};
			},
		);
		await budget.lease(eslintChild());

		expect(roots).toStrictEqual([process.cwd()]);
		expect(record.requests[0]!.cost!.project).toBe("test");
	});
});

describe("worker demands on composed children", () => {
	it("asks for the planned ESLint workers under the pass's cost", ({ expect }) => {
		expect.assertions(1);

		const command = composeEslintCommand(
			options(),
			baseContext({ concurrency: 3, eslintLabel: "fast", typeAwareEnv: "off" }),
		);

		expect(command.workers).toStrictEqual({
			flag: "--concurrency",
			maxWorkers: 3,
			memoryPerWorkerMb: FAST_WORKER_MEMORY_MB,
			pass: "eslint-fast",
		});
	});

	it("asks for one worker when the plan runs ESLint on the main thread", ({ expect }) => {
		expect.assertions(1);

		const command = composeEslintCommand(options({ concurrency: "off" }), baseContext());

		expect(command.workers!.maxWorkers).toBe(1);
	});

	it("counts a program-building worker at its heap", ({ expect }) => {
		expect.assertions(2);

		const heap: PassHeap = { nodeOptions: undefined, note: "", watch: true };
		const command = composeEslintCommand(
			options(),
			baseContext({ concurrency: 2, eslintLabel: "typed", heap, typeAwareEnv: "only" }),
		);

		expect(command.workers!.memoryPerWorkerMb).toBe(PROGRAM_WORKER_MEMORY_MB);
		expect(command.workers!.pass).toBe("eslint-typed");
	});

	it("asks for oxlint's threads", ({ expect }) => {
		expect.assertions(1);

		const command = composeOxlintCommand(options(), {
			oxlintTypeAware: false,
			paths: ["."],
			threads: 4,
		});

		expect(command.workers).toStrictEqual({
			flag: "--threads",
			maxWorkers: 4,
			memoryPerWorkerMb: OXLINT_THREAD_MEMORY_MB,
			pass: undefined,
		});
	});

	it("passes oxlint its planned threads, which a grant rewrites", ({ expect }) => {
		expect.assertions(2);

		const command = composeOxlintCommand(options(), {
			oxlintTypeAware: false,
			paths: ["."],
			threads: 4,
		});

		// A child that runs without a lease keeps the planned count.
		expect(command.args.slice(0, 2)).toStrictEqual(["--threads", "4"]);
		expect(applyGrant(command, 2).args).toStrictEqual([
			"--threads",
			"2",
			"--no-error-on-unmatched-pattern",
			".",
		]);
	});

	it.for([["--concurrency", "8"], ["--concurrency=8"]])(
		"leases nothing for ESLint when the user forwards %s",
		(eslintArgs, { expect }) => {
			expect.assertions(1);

			const command = composeEslintCommand(
				options({ eslintArgs }),
				baseContext({ concurrency: 4, eslintLabel: "fast" }),
			);

			expect(command.workers).toBeUndefined();
		},
	);

	it("leases nothing for oxlint without a thread count", ({ expect }) => {
		expect.assertions(1);

		const command = composeOxlintCommand(options(), { oxlintTypeAware: false, paths: ["."] });

		expect(command.workers).toBeUndefined();
	});
});

describe("resolveOxlintThreads", () => {
	it("gives oxlint a quarter of the threads locally", ({ expect }) => {
		expect.assertions(2);

		expect(resolveOxlintThreads(options(), 16, false)).toBe(4);
		expect(resolveOxlintThreads(options(), 2, false)).toBe(1);
	});

	it("gives oxlint every thread in CI", ({ expect }) => {
		expect.assertions(1);

		expect(resolveOxlintThreads(options(), 16, true)).toBe(16);
	});

	it("leaves oxlint's threads to a user who sets them", ({ expect }) => {
		expect.assertions(2);

		expect(
			resolveOxlintThreads(options({ oxlintArgs: ["--threads", "2"] }), 16, false),
		).toBeUndefined();
		expect(
			resolveOxlintThreads(options({ oxlintArgs: ["--threads=2"] }), 16, false),
		).toBeUndefined();
	});
});

describe("leasing in execute", () => {
	function eslintFixture(onTestFinished: TestContext["onTestFinished"]): string {
		const directory = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-budget-")),
		);
		onTestFinished(() => {
			fs.rmSync(directory, { force: true, recursive: true });
		});

		const packageDirectory = path.join(directory, "node_modules", "eslint");
		fs.mkdirSync(packageDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(packageDirectory, "package.json"),
			JSON.stringify({ name: "eslint", bin: { eslint: "bin.js" }, version: "0.0.0" }),
		);
		fs.writeFileSync(path.join(packageDirectory, "bin.js"), "");
		return directory;
	}

	/**
	 * Record each spawn line, and keep the rest of stderr out of the report.
	 *
	 * @param onTestFinished - Restores stderr after the test.
	 * @param events - Where each spawn is recorded.
	 */
	function captureSpawns(
		onTestFinished: TestContext["onTestFinished"],
		events: Array<string>,
	): void {
		const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
			const match = /\[(\w+)\]\S* spawned/.exec(String(chunk));
			if (match !== null) {
				events.push(`spawn ${match[1]!}`);
			}

			return true;
		});
		onTestFinished(() => {
			spy.mockRestore();
		});
	}

	function child(label: ChildCommand["label"]): ChildCommand {
		return { args: [], bin: "eslint", env: {}, label, watchHeap: false, workers: demand() };
	}

	function heldLease(command: ChildCommand, onRelease: () => void): ChildLease {
		return { command, grant: undefined, release: onRelease, watch: () => {} };
	}

	it("spawns each child before it leases the next", async ({ expect, onTestFinished }) => {
		expect.assertions(2);

		const directory = eslintFixture(onTestFinished);
		const events: Array<string> = [];
		captureSpawns(onTestFinished, events);
		const budget: RunBudget = {
			close: () => {},
			lease: async (command) => {
				events.push(`lease ${command.label}`);
				return heldLease(command, () => {});
			},
		};

		const code = await execute([child("fast"), child("typed")], directory, false, budget);

		expect(code).toBe(0);
		expect(events).toStrictEqual(["lease fast", "spawn fast", "lease typed", "spawn typed"]);
	}, 15_000);

	it.for([true, false])(
		"gives up a pending lease on cancel and returns a late grant (sequential: %s)",
		{ timeout: 15_000 },
		async (sequential, { expect, onTestFinished }) => {
			expect.assertions(2);

			const directory = eslintFixture(onTestFinished);
			const events: Array<string> = [];
			captureSpawns(onTestFinished, events);
			onTestFinished(resetCancellation);
			const asked = Promise.withResolvers<ChildCommand>();
			const granted = Promise.withResolvers<ChildLease>();
			const released = Promise.withResolvers<void>();
			const budget: RunBudget = {
				close: () => {},
				lease: async (command) => {
					asked.resolve(command);
					return granted.promise;
				},
			};

			const run = execute([child("typed")], directory, sequential, budget);
			// The run listens for a cancel before it asks for the lease.
			const command = await asked.promise;
			process.emit("SIGINT", "SIGINT");
			const code = await run;
			granted.resolve(heldLease(command, released.resolve));
			await released.promise;

			expect(code).toBe(128 + os.constants.signals.SIGINT);
			expect(events).toStrictEqual([]);
		},
	);
});
