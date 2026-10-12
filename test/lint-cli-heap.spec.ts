import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { TestContext } from "vitest";
import { describe, it, vi } from "vitest";

import type { ChildCommand } from "../src/lint-cli/lib/cli/types.ts";
import { resolveCacheKey } from "../src/lint-cli/lib/context.ts";
import { execute, outOfMemoryHint } from "../src/lint-cli/lib/exec/execute.ts";
import { resolveBootstrap } from "../src/lint-cli/lib/exec/resolve.ts";
import { computeWorkerCount, resolveWorkerLimits } from "../src/lint-cli/lib/plan/concurrency.ts";
import type { HeapBudget, MemoryFacts } from "../src/lint-cli/lib/plan/heap.ts";
import {
	capWorkersForHeap,
	heapPerWorkerMb,
	heapWorkerCap,
	resolveHeapBudget,
	resolveHeapSetting,
} from "../src/lint-cli/lib/plan/heap.ts";
import { composeInDirectory } from "./lint-cli-helpers.ts";

/** A 16 GB machine with a 4 GB default heap: an 8 GB budget, two workers. */
const SMALL_MACHINE: MemoryFacts = { availableMb: 16_384, defaultHeapMb: 4096 };

/** A 96 GB machine with a 4 GB default heap: a 48 GB budget. */
const LARGE_MACHINE: MemoryFacts = { availableMb: 98_304, defaultHeapMb: 4096 };

function temporaryDirectory(onTestFinished: TestContext["onTestFinished"]): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-heap-"));
	onTestFinished(() => {
		fs.rmSync(directory, { force: true, recursive: true });
	});

	return fs.realpathSync(directory);
}

/**
 * A fixture of `count` TypeScript files, so a one-file-per-worker run asks for
 * `count` type-aware workers.
 *
 * @param directory - The fixture root.
 * @param count - How many files to write.
 */
function writeSources(directory: string, count: number): void {
	for (let index = 0; index < count; index += 1) {
		fs.writeFileSync(path.join(directory, `file${String(index)}.ts`), "export const x = 1;\n");
	}
}

function byLabel(commands: Array<ChildCommand>, label: string): ChildCommand {
	const command = commands.find((entry) => entry.label === label);
	if (command === undefined) {
		throw new Error(`no ${label} child`);
	}

	return command;
}

function concurrencyOf(command: ChildCommand): string | undefined {
	return command.args[command.args.indexOf("--concurrency") + 1];
}

function budget(environment: NodeJS.ProcessEnv, memory: MemoryFacts): HeapBudget {
	return resolveHeapBudget(environment, memory);
}

describe("resolveHeapSetting", () => {
	it("defaults to auto", ({ expect }) => {
		expect.assertions(1);

		expect(resolveHeapSetting({})).toStrictEqual({ kind: "auto" });
	});

	it("reads a size in MB, off, and falls back to auto on anything else", ({ expect }) => {
		expect.assertions(4);

		expect(resolveHeapSetting({ LINT_TYPED_HEAP_MB: "8192" })).toStrictEqual({
			kind: "fixed",
			mb: 8192,
		});
		expect(resolveHeapSetting({ LINT_TYPED_HEAP_MB: "off" })).toStrictEqual({ kind: "off" });
		expect(resolveHeapSetting({ LINT_TYPED_HEAP_MB: "8gb" })).toStrictEqual({ kind: "auto" });
		expect(resolveHeapSetting({ LINT_TYPED_HEAP_MB: "auto" })).toStrictEqual({ kind: "auto" });
	});

	it("lets a heap size already in NODE_OPTIONS win over LINT_TYPED_HEAP_MB", ({ expect }) => {
		expect.assertions(2);

		expect(
			resolveHeapSetting({
				LINT_TYPED_HEAP_MB: "8192",
				NODE_OPTIONS: "--enable-source-maps --max-old-space-size=2048",
			}),
		).toStrictEqual({ kind: "inherited" });
		expect(resolveHeapSetting({ NODE_OPTIONS: "--max_old_space_size=2048" })).toStrictEqual({
			kind: "inherited",
		});
	});
});

describe("heap budget", () => {
	it("splits half the memory across the workers under auto", ({ expect }) => {
		expect.assertions(3);

		const auto = budget({}, LARGE_MACHINE);

		expect(heapPerWorkerMb(auto, 6)).toBe(8192);
		expect(heapPerWorkerMb(auto, "off")).toBe(49_152);
		// A share at or below Node's default adds no flag.
		expect(heapPerWorkerMb(auto, 12)).toBeUndefined();
	});

	it("caps the workers so each keeps at least Node's default heap", ({ expect }) => {
		expect.assertions(3);

		expect(heapWorkerCap(budget({}, SMALL_MACHINE))).toBe(2);
		// A requested size is what each worker may grow to.
		expect(heapWorkerCap(budget({ LINT_TYPED_HEAP_MB: "8192" }, SMALL_MACHINE))).toBe(1);
		// Never below one worker, however small the machine.
		expect(heapWorkerCap(budget({}, { availableMb: 2048, defaultHeapMb: 2048 }))).toBe(1);
	});

	it("places no cap and adds no flag when off or inherited", ({ expect }) => {
		expect.assertions(4);

		const off = budget({ LINT_TYPED_HEAP_MB: "off" }, SMALL_MACHINE);
		const inherited = budget({ NODE_OPTIONS: "--max-old-space-size=2048" }, SMALL_MACHINE);

		expect(heapWorkerCap(off)).toBeUndefined();
		expect(heapPerWorkerMb(off, 6)).toBeUndefined();
		expect(heapWorkerCap(inherited)).toBeUndefined();
		expect(heapPerWorkerMb(inherited, 6)).toBeUndefined();
	});

	it("never tightens an explicit LINT_MAX_WORKERS", ({ expect }) => {
		expect.assertions(2);

		const explicit = resolveWorkerLimits({ LINT_MAX_WORKERS: "6" }, 32, false);
		const derived = resolveWorkerLimits({}, 32, false);

		expect(capWorkersForHeap(6, explicit, budget({}, SMALL_MACHINE))).toBe(6);
		expect(capWorkersForHeap(6, derived, budget({}, SMALL_MACHINE))).toBe(2);
	});
});

describe("heap flag on composed children", () => {
	it("gives only the program-building child the flag", ({ expect, onTestFinished }) => {
		expect.assertions(3);

		const directory = temporaryDirectory(onTestFinished);
		const { commands } = composeInDirectory([], directory, { memory: LARGE_MACHINE });

		expect(byLabel(commands, "oxc").env).toStrictEqual({});
		expect(byLabel(commands, "fast").env).toStrictEqual({ ESLINT_TYPE_AWARE: "off" });
		expect(byLabel(commands, "typed").env).toStrictEqual({
			ESLINT_TYPE_AWARE: "only",
			NODE_OPTIONS: "--max-old-space-size=49152",
		});
	});

	it("gives the full pass the flag in CI", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = temporaryDirectory(onTestFinished);
		const { commands } = composeInDirectory([], directory, {
			environment: { CI: "true" },
			memory: LARGE_MACHINE,
		});

		expect(byLabel(commands, "eslint").env["NODE_OPTIONS"]).toBe("--max-old-space-size=49152");
	});

	it("appends to an inherited NODE_OPTIONS without a heap size", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = temporaryDirectory(onTestFinished);
		const { commands } = composeInDirectory([], directory, {
			environment: { NODE_OPTIONS: "--enable-source-maps" },
			memory: LARGE_MACHINE,
		});

		expect(byLabel(commands, "typed").env["NODE_OPTIONS"]).toBe(
			"--enable-source-maps --max-old-space-size=49152",
		);
	});

	it("keeps a heap size the user put in NODE_OPTIONS", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = temporaryDirectory(onTestFinished);
		const { commands } = composeInDirectory([], directory, {
			environment: { LINT_TYPED_HEAP_MB: "8192", NODE_OPTIONS: "--max-old-space-size=2048" },
			memory: LARGE_MACHINE,
		});

		// No override: the child inherits the user's value as it stands.
		expect(Object.hasOwn(byLabel(commands, "typed").env, "NODE_OPTIONS")).toBe(false);
	});

	it("uses an explicit size as given", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = temporaryDirectory(onTestFinished);
		const { commands } = composeInDirectory([], directory, {
			environment: { LINT_TYPED_HEAP_MB: "6144" },
			memory: LARGE_MACHINE,
		});

		expect(byLabel(commands, "typed").env["NODE_OPTIONS"]).toBe("--max-old-space-size=6144");
	});

	it("runs fewer workers on a small machine instead of overrunning its memory", ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		const directory = temporaryDirectory(onTestFinished);
		writeSources(directory, 8);
		const { commands } = composeInDirectory(["--type-aware=only"], directory, {
			environment: { FILES_PER_WORKER: "1" },
			memory: { availableMb: 8192, defaultHeapMb: 4096 },
		});
		const typed = byLabel(commands, "typed");

		// The 4 GB budget holds one default heap: one worker, at Node's default.
		expect(concurrencyOf(typed)).toBe("off");
		expect(Object.hasOwn(typed.env, "NODE_OPTIONS")).toBe(false);
	});

	it("sizes workers exactly as before when off", ({ expect, onTestFinished }) => {
		expect.assertions(2);

		const directory = temporaryDirectory(onTestFinished);
		writeSources(directory, 8);
		const environment = { FILES_PER_WORKER: "1", LINT_TYPED_HEAP_MB: "off" };
		const { commands } = composeInDirectory(["--type-aware=only"], directory, {
			environment,
			memory: { availableMb: 8192, defaultHeapMb: 4096 },
		});
		const typed = byLabel(commands, "typed");
		const { typedMaxWorkers } = resolveWorkerLimits(
			environment,
			os.availableParallelism(),
			false,
		);
		const expected = computeWorkerCount({
			dirtyCount: 8,
			filesPerWorker: 1,
			maxWorkers: typedMaxWorkers,
		});

		expect(concurrencyOf(typed)).toBe(String(expected));
		expect(Object.hasOwn(typed.env, "NODE_OPTIONS")).toBe(false);
	});

	it("leaves the cache key alone", ({ expect }) => {
		expect.assertions(1);

		expect(
			resolveCacheKey({
				LINT_TYPED_HEAP_MB: "8192",
				NODE_OPTIONS: "--max-old-space-size=2048",
			}),
		).toBe(resolveCacheKey({}));
	});
});

describe("out-of-memory hint", () => {
	function writeFakeEslint(directory: string, body: string): void {
		const packageDirectory = path.join(directory, "node_modules", "eslint");
		fs.mkdirSync(packageDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(packageDirectory, "package.json"),
			JSON.stringify({ name: "eslint", bin: { eslint: "bin.js" }, version: "0.0.0" }),
		);
		fs.writeFileSync(path.join(packageDirectory, "bin.js"), body);
	}

	const outOfMemoryBin =
		"process.stderr.write('Error [ERR_WORKER_OUT_OF_MEMORY]: Worker terminated due to " +
		"reaching memory limit: JS heap out of memory\\n');process.exitCode=2;";

	function captureStderr(onTestFinished: TestContext["onTestFinished"]): () => string {
		const written: Array<string> = [];
		const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
			written.push(String(chunk));
			return true;
		});
		onTestFinished(() => {
			spy.mockRestore();
		});

		return () => written.join("");
	}

	it("names the override after a concurrent typed child runs out of heap", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		const directory = temporaryDirectory(onTestFinished);
		writeFakeEslint(directory, outOfMemoryBin);
		const stderr = captureStderr(onTestFinished);

		const code = await execute(
			[
				{ args: [], bin: "eslint", env: {}, label: "fast" },
				{ args: [], bin: "eslint", env: {}, label: "typed" },
			],
			directory,
			false,
		);

		expect(code).toBe(1);
		expect(stderr()).toContain(outOfMemoryHint("typed"));
		// The fast pass gets no heap flag, so it gets no hint about one.
		expect(stderr()).not.toContain(outOfMemoryHint("fast"));
	}, 15_000);

	it("names the override after a lone child runs out of heap, keeping its stderr", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		const directory = temporaryDirectory(onTestFinished);
		writeFakeEslint(directory, outOfMemoryBin);
		const stderr = captureStderr(onTestFinished);

		const code = await execute(
			[{ args: [], bin: "eslint", env: {}, label: "eslint" }],
			directory,
			true,
		);

		expect(code).toBe(2);
		expect(stderr()).toContain("ERR_WORKER_OUT_OF_MEMORY");
		expect(stderr()).toContain(outOfMemoryHint("eslint"));
	}, 15_000);

	it("stays quiet when the child fails for another reason", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		const directory = temporaryDirectory(onTestFinished);
		writeFakeEslint(directory, "process.stderr.write('boom\\n');process.exitCode=2;");
		const stderr = captureStderr(onTestFinished);

		await execute([{ args: [], bin: "eslint", env: {}, label: "typed" }], directory, true);

		expect(stderr()).not.toContain("ran out of memory");
	}, 15_000);
});

describe("ESLint workers under the heap flag", () => {
	/**
	 * A config whose one rule reports, for every file, whether it ran on a
	 * worker thread and that thread's heap limit in MB.
	 */
	const heapReportConfig = `
import v8 from "node:v8";
import { isMainThread } from "node:worker_threads";

export default [{
	plugins: {
		heap: {
			rules: {
				report: {
					create(context) {
						return {
							Program(node) {
								const mb = Math.floor(v8.getHeapStatistics().heap_size_limit / 1048576);
								context.report({ message: JSON.stringify({ mb, worker: !isMainThread }), node });
							},
						};
					},
				},
			},
		},
	},
	rules: { "heap/report": "error" },
}];
`;

	it("inherit the limit set through NODE_OPTIONS", ({ expect, onTestFinished }) => {
		expect.assertions(4);

		const directory = temporaryDirectory(onTestFinished);
		fs.writeFileSync(path.join(directory, "eslint.config.mjs"), heapReportConfig);
		for (const name of ["a.js", "b.js"]) {
			fs.writeFileSync(path.join(directory, name), "export const x = 1;\n");
		}

		const require = createRequire(import.meta.url);
		const eslintBin = path.join(
			path.dirname(require.resolve("eslint/package.json")),
			"bin",
			"eslint.js",
		);
		const heapMb = 1536;

		// Launched the way the runner launches every engine: through the
		// bootstrap, its arguments on stdin, the flag in the child's env.
		const result = spawnSync(process.execPath, [resolveBootstrap(), eslintBin], {
			cwd: directory,
			encoding: "utf8",
			env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${String(heapMb)}` },
			input: JSON.stringify(["--concurrency", "2", "--format", "json", "a.js", "b.js"]),
		});

		const reports = (
			JSON.parse(result.stdout) as Array<{ messages: Array<{ message: string }> }>
		)
			.flatMap((file) => file.messages)
			.map((message) => JSON.parse(message.message) as { mb: number; worker: boolean });

		expect(reports).toHaveLength(2);
		expect(reports.every((report) => report.worker)).toBe(true);

		// The limit V8 reports adds the young generation on top of the flag.
		const limits = reports.map((report) => report.mb);

		expect(Math.min(...limits)).toBeGreaterThanOrEqual(heapMb);
		expect(Math.max(...limits)).toBeLessThan(heapMb + 512);
	}, 60_000);
});
