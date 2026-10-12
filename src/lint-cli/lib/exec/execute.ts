import ansis from "ansis";
import type { FlowController } from "concurrently";
import {
	createConcurrently,
	KillOnSignal,
	LogError,
	LogExit,
	Logger,
	LogOutput,
} from "concurrently";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { spawn } from "node:child_process";
import os from "node:os";
import process from "node:process";
import { Writable } from "node:stream";

import type { ChildCommand, ToolLabel } from "../cli/types.ts";
import { HEAP_ENV } from "../plan/heap.ts";
import { resolveBootstrap, resolveLocalBin } from "./resolve.ts";

/** An engine child ready to spawn: its command and resolved launch target. */
interface EngineLaunch {
	/** Absolute path to the engine's JavaScript bin. */
	bin: string;
	/** The composed child command. */
	command: ChildCommand;
}

/**
 * What V8 writes when a heap fills: `ERR_WORKER_OUT_OF_MEMORY` from a worker,
 * `JavaScript heap out of memory` from the main thread.
 */
const OUT_OF_MEMORY = /ERR_WORKER_OUT_OF_MEMORY|heap out of memory/;

/** Characters kept between stderr chunks, so a split marker still matches. */
const OUT_OF_MEMORY_TAIL = 64;

/** The signals that cancel a run, matching `concurrently`'s `KillOnSignal`. */
const CANCEL_SIGNALS = ["SIGHUP", "SIGINT", "SIGTERM"] as const;

/**
 * The first cancelling signal received while this run's children were running.
 * Shared across `execute` calls on purpose: a run is a sequence of them (three
 * for a `--fix` run), and once the user has cancelled one of them none of
 * the rest may start. {@link resetCancellation} Scopes it to one run.
 */
let cancelledBy: NodeJS.Signals | undefined;

/**
 * Forget any cancellation recorded by an earlier run in this process. Called
 * as a run starts, so a second `runLint` in the same process is not refused
 * for a signal the first one received.
 */
export function resetCancellation(): void {
	cancelledBy = undefined;
}

/** Prefix colour per child label for `concurrently`; kept visually distinct. */
const PREFIX_COLOR: Record<ToolLabel, "blue" | "cyan" | "magenta"> = {
	eslint: "blue",
	fast: "blue",
	oxc: "magenta",
	typed: "cyan",
};

/** An output stream whose writes are withheld until it is released. */
interface HeldOutput {
	/** Flush what was withheld and let every later write through. */
	release: () => void;
	/** The stream to hand `concurrently`. */
	stream: Writable;
}

/**
 * The hint printed after a program-building child ran out of heap, below the
 * engine's own stack trace.
 *
 * @param label - The child's label.
 * @returns One stderr line.
 */
export function outOfMemoryHint(label: ToolLabel): string {
	return (
		`isentinel-lint: the ${label} ESLint pass ran out of memory. Set ${HEAP_ENV}=<mb> ` +
		"to give each worker more heap; the runner starts fewer workers to keep them in budget.\n"
	);
}

/**
 * Run the composed children and aggregate their exit codes.
 *
 * Sequential when the caller asks for it: a lone child gains nothing from the
 * concurrently harness, and the writers of a `--fix` run (the oxlint child, and
 * later the one ESLint child that fixes) are each spawned on their own so
 * nothing is reading a file while one of them rewrites it. Otherwise every
 * child runs at once. Either way all of them run to completion: an ordinary
 * lint failure in one no longer kills its siblings, so the user keeps every
 * result. The returned code is non-zero when any child exited non-zero.
 *
 * @param commands - The child commands to run.
 * @param cwd - The working directory.
 * @param sequential - Whether to run the children one at a time.
 * @returns The aggregated exit code.
 */
export async function execute(
	commands: Array<ChildCommand>,
	cwd: string,
	sequential: boolean,
): Promise<number> {
	const code = await (sequential ? runSequential(commands, cwd) : startGroup(commands, cwd));
	return cancelledCode() ?? code;
}

/**
 * Run a staged set of children: spawn `commands` now, then resolve the rest and
 * spawn those too, all of them concurrent. `resolveDeferred` is the expensive
 * planning step (the TypeScript builder) that the eager children exist to run
 * alongside — it blocks this process, but they are already OS processes and
 * keep linting throughout.
 *
 * The deferred children go into their own `concurrently` group, because a group
 * spawns every command the moment it is created. Their output is withheld until
 * the eager group has flushed: `group: true` orders output by declaration and
 * the deferred children are declared last, so this reproduces the ordering an
 * unstaged run would have had rather than letting two lint reports interleave.
 *
 * As with {@link execute}, every child runs to completion and the returned code
 * is non-zero when any of them exited non-zero.
 *
 * @param commands - The children to spawn immediately.
 * @param cwd - The working directory.
 * @param resolveDeferred - Plans the remaining children; called once, after the
 *   eager ones have spawned. May return an empty list.
 * @returns The aggregated exit code.
 */
export async function executeStaged(
	commands: Array<ChildCommand>,
	cwd: string,
	resolveDeferred: () => Array<ChildCommand>,
): Promise<number> {
	const eager = startGroup(commands, cwd);
	const deferred = resolveDeferred();

	// The builder behind `resolveDeferred` blocks the event loop, so a Ctrl+C
	// pressed during it is only dispatched now. Let it land before deciding
	// whether to start anything more.
	await new Promise((resolve) => {
		setImmediate(resolve);
	});
	if (cancelledBy !== undefined || deferred.length === 0) {
		// Awaited before the check: `KillOnSignal` reports a SIGINT-killed group
		// as a success, so only the recorded signal can make the run fail.
		const eagerCode = await eager;
		return cancelledCode() ?? eagerCode;
	}

	const held = createHeldOutput();
	const later = startGroup(deferred, cwd, held.stream);

	const eagerCode = await eager;
	held.release();
	const deferredCode = await later;

	return cancelledCode() ?? (eagerCode === 0 ? deferredCode : eagerCode);
}

/**
 * Announce a child on stderr once it has been spawned. `concurrently` groups
 * child output, so a slow child holds back everything declared after it and the
 * terminal looks idle until the first one exits; these lines are the only
 * signal that the run is alive. They go to stderr so they never contaminate a
 * piped report.
 *
 * @param command - The child that was spawned.
 */
function announce(command: ChildCommand): void {
	const prefix = ansis[PREFIX_COLOR[command.label]](`[${command.label}]`);
	process.stderr.write(`${prefix} spawned ${command.bin}\n`);
}

/**
 * The names the children of one group are registered and logged under: the
 * engine, never its arguments. `concurrently` prints the name on each child's
 * exit line, so it must stay short however many files the child lints. The
 * line already carries the pass as its prefix (`[fast] eslint exited with code
 * 1`), so the pass only joins the name when two children share an engine.
 *
 * @param commands - The group's children.
 * @returns Each child paired with a name unique within the group.
 */
function nameCommands(commands: Array<ChildCommand>): Array<[string, ChildCommand]> {
	const taken = new Set<string>();
	return commands.map((command) => {
		const shared = commands.filter((other) => other.bin === command.bin).length > 1;
		const base = shared ? `${command.bin} (${command.label})` : command.bin;
		let name = base;
		let suffix = 1;
		while (taken.has(name)) {
			suffix += 1;
			name = `${base} #${String(suffix)}`;
		}

		taken.add(name);
		return [name, command];
	});
}

/**
 * Spawn an engine child through the bootstrap and stream it its arguments.
 *
 * The OS command line is always `node <bootstrap> <bin>`, with no shell, so its
 * length does not depend on the file list and no path is ever interpreted by a
 * shell. The complete argument list follows as JSON on the child's stdin,
 * which is why stdin is always a pipe here whatever the caller asked for.
 *
 * @param launch - The child and its resolved bin.
 * @param options - Spawn options (cwd, env, stdout/stderr handling).
 * @returns The spawned child.
 */
function launchEngine({ bin, command }: EngineLaunch, options: SpawnOptions): ChildProcess {
	const stdio = Array.isArray(options.stdio) ? options.stdio : [];
	const child = spawn(process.execPath, [resolveBootstrap(), bin], {
		...options,
		shell: false,
		stdio: ["pipe", stdio[1] ?? "inherit", stdio[2] ?? "inherit"],
	});

	// A child that dies before reading its arguments (killed, or failing at
	// startup) breaks this pipe. Its exit status already reports that, so the
	// write error is not a second failure and must not crash the runner.
	child.stdin?.on("error", () => {
		// Deliberately ignored; see above.
	});
	child.stdin?.end(JSON.stringify(command.args));
	return child;
}

/**
 * Kill a group's children and stop it spawning more when its output stream
 * fails — typically `EPIPE` once the reader of a piped report (`| head`) has
 * gone. Mirrors `concurrently`'s own `OutputErrorHandler`, which its package
 * exports do not expose.
 *
 * @param outputStream - The stream the group writes to.
 * @param abortController - Aborts the group.
 * @returns The flow controller.
 */
function killOnOutputError(
	outputStream: Writable,
	abortController: AbortController,
): FlowController {
	return {
		handle: (commands) => {
			function onError(): void {
				for (const command of commands) {
					command.kill();
				}

				abortController.abort();
			}

			outputStream.on("error", onError);
			return {
				commands,
				onFinish: () => {
					outputStream.off("error", onError);
				},
			};
		},
	};
}

/**
 * Record a cancelling signal for as long as children are running, and hand it
 * to `onSignal`. Listening at all replaces Node's default of exiting on the
 * signal, which is what lets the children be stopped and reaped first rather
 * than orphaned.
 *
 * @param onSignal - Forwards the signal to the running children; omitted when
 *   something else (`concurrently`'s `KillOnSignal`) already does.
 * @returns Removes the listeners.
 */
function trackCancellation(onSignal?: (signal: NodeJS.Signals) => void): () => void {
	function listener(signal: NodeJS.Signals): void {
		cancelledBy ??= signal;
		onSignal?.(signal);
	}

	for (const signal of CANCEL_SIGNALS) {
		process.on(signal, listener);
	}

	return () => {
		for (const signal of CANCEL_SIGNALS) {
			process.off(signal, listener);
		}
	};
}

/**
 * Watch a child's stderr for V8's out-of-memory report. Reads alongside
 * whatever else consumes the stream, and never alters it.
 *
 * @param child - The spawned child.
 * @param onExhausted - Called once, when the report is seen.
 */
function watchOutOfMemory(child: ChildProcess, onExhausted: () => void): void {
	let tail = "";
	let seen = false;
	child.stderr?.on("data", (chunk: unknown) => {
		if (seen) {
			return;
		}

		const text = tail + String(chunk);
		if (OUT_OF_MEMORY.test(text)) {
			seen = true;
			onExhausted();
			return;
		}

		tail = text.slice(-OUT_OF_MEMORY_TAIL);
	});
}

/**
 * Start every command as one `concurrently` group and announce the children.
 * Unlike the previous `killOthersOn: ["failure"]` behaviour, an ordinary lint
 * failure in one child no longer kills its siblings — each runs to the end so
 * the user keeps every result. The resolved code is non-zero when any child
 * exited non-zero; the promise never rejects.
 *
 * Built on `concurrently`'s core rather than its default export, because the
 * wrapper always launches a command *string* through a shell (`cmd.exe` on
 * Windows), and that string would have to carry every lint target. Here the
 * group's spawner launches each engine directly through the bootstrap (see
 * {@link launchEngine}); the command string is only the label `concurrently`
 * logs. The controllers are the ones the wrapper wires that do anything under
 * the options this runner always used — output and error logging, exit lines,
 * signal forwarding and the broken-output-pipe guard — and nothing else.
 *
 * @param commands - The child commands to run.
 * @param cwd - The working directory.
 * @param outputStream - Where the group writes its child output; defaults to
 *   stdout. A staged run passes a held stream (see {@link createHeldOutput}).
 * @returns The aggregated exit code.
 */
async function startGroup(
	commands: Array<ChildCommand>,
	cwd: string,
	outputStream: Writable = process.stdout,
): Promise<number> {
	if (cancelledBy !== undefined || commands.length === 0) {
		return 0;
	}

	// Resolve every bin before anything spawns, so a missing engine is a
	// CliError up front rather than a failure inside the group.
	const launches = new Map<string, EngineLaunch>(
		nameCommands(commands).map(([name, command]) => {
			return [name, { bin: resolveLocalBin(command.bin, cwd), command }];
		}),
	);

	const logger = new Logger({});
	const exhausted = new Set<ToolLabel>();
	const abortController = new AbortController();
	const stopTracking = trackCancellation();
	const { result } = createConcurrently(
		Array.from(launches, ([name, { command }]) => {
			return {
				name: command.label,
				command: name,
				env: command.env,
				prefixColor: PREFIX_COLOR[command.label],
			};
		}),
		{
			abortSignal: abortController.signal,
			controllers: [
				new LogError({ logger }),
				new LogOutput({ logger }),
				new LogExit({ logger }),
				new KillOnSignal({ abortController, process }),
				killOnOutputError(outputStream, abortController),
			],
			cwd,
			group: true,
			logger,
			outputStream,
			spawn: (name, options) => {
				const launch = launches.get(name);
				if (launch === undefined) {
					throw new Error(`isentinel-lint: no engine registered as "${name}".`);
				}

				const child = launchEngine(launch, options);
				if (launch.command.watchHeap) {
					watchOutOfMemory(child, () => {
						exhausted.add(launch.command.label);
					});
				}

				return child;
			},
		},
	);

	// `concurrently` starts every child synchronously before returning (no
	// `maxProcesses` cap), so these lines report real spawns rather than intent.
	// Everything above runs before this function's first `await`, which is what
	// lets a staged caller keep working while the group it just started lints.
	for (const command of commands) {
		announce(command);
	}

	try {
		await result;
		return 0;
	} catch {
		// Every child ran to completion (no kill-on-failure); the promise rejects
		// when any exited non-zero.
		return 1;
	} finally {
		stopTracking();
		for (const label of exhausted) {
			process.stderr.write(outOfMemoryHint(label));
		}
	}
}

function signalExitCode(signal: NodeJS.Signals): number {
	return 128 + os.constants.signals[signal];
}

/**
 * The exit code for a cancelled run (`128 + signal number`, as a shell reports
 * it), or `undefined` when nothing cancelled it.
 *
 * @returns The exit code, when cancelled.
 */
function cancelledCode(): number | undefined {
	return cancelledBy === undefined ? undefined : signalExitCode(cancelledBy);
}

async function spawnChild(command: ChildCommand, cwd: string): Promise<number> {
	const bin = resolveLocalBin(command.bin, cwd);
	// A watched child's stderr is piped so it can be read, and forwarded as is.
	const watched = command.watchHeap;
	let exhausted = false;
	return new Promise((resolve) => {
		const child = launchEngine(
			{ bin, command },
			{
				cwd,
				env: { ...process.env, ...command.env },
				stdio: ["inherit", "inherit", watched ? "pipe" : "inherit"],
			},
		);
		if (watched) {
			child.stderr?.on("data", (chunk: Uint8Array) => {
				process.stderr.write(chunk);
			});
			watchOutOfMemory(child, () => {
				exhausted = true;
			});
		}

		announce(command);
		const stopTracking = trackCancellation((signal) => {
			child.kill(signal);
		});
		child.on("error", () => {
			stopTracking();
			resolve(1);
		});
		child.on("close", (code, signal) => {
			stopTracking();
			if (exhausted) {
				process.stderr.write(outOfMemoryHint(command.label));
			}

			resolve(code ?? (signal === null ? 1 : signalExitCode(signal)));
		});
	});
}

async function runSequential(commands: Array<ChildCommand>, cwd: string): Promise<number> {
	let exitCode = 0;
	for (const command of commands) {
		if (cancelledBy !== undefined) {
			break;
		}

		const code = await spawnChild(command, cwd);
		if (code !== 0) {
			exitCode = code;
		}
	}

	return exitCode;
}

/**
 * A stream that swallows writes into memory until {@link HeldOutput.release} is
 * called, then replays them to stdout and passes everything after them straight
 * through.
 *
 * `concurrently` writes child output to whichever stream it is given, on its
 * own schedule; this is the only handle on *when* that output surfaces, which a
 * staged run needs so a group started late cannot cut into a group started
 * early.
 *
 * @returns The stream and its release trigger.
 */
function createHeldOutput(): HeldOutput {
	const withheld: Array<string> = [];
	let released = false;

	const stream = new Writable({
		decodeStrings: false,
		write(chunk: unknown, _encoding, callback) {
			const text = String(chunk);
			if (released) {
				process.stdout.write(text);
			} else {
				withheld.push(text);
			}

			callback();
		},
	});

	return {
		release: () => {
			released = true;
			for (const text of withheld) {
				process.stdout.write(text);
			}

			withheld.length = 0;
		},
		stream,
	};
}
