import ansis from "ansis";
import concurrently from "concurrently";
import { spawn } from "node:child_process";
import process from "node:process";
import { Writable } from "node:stream";

import type { ChildCommand, ToolLabel } from "../cli/types.ts";
import { resolveLocalBin } from "./resolve.ts";
import { buildShellCommand } from "./shell.ts";

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
	return sequential ? runSequential(commands, cwd) : startGroup(commands, cwd);
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
	if (deferred.length === 0) {
		return eager;
	}

	const held = createHeldOutput();
	const later = startGroup(deferred, cwd, held.stream);

	const eagerCode = await eager;
	held.release();
	const deferredCode = await later;

	return eagerCode === 0 ? deferredCode : eagerCode;
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
 * Start every command as one `concurrently` group and announce the children.
 * Unlike the previous `killOthersOn: ["failure"]` behaviour, an ordinary lint
 * failure in one child no longer kills its siblings — each runs to the end so
 * the user keeps every result. The resolved code is non-zero when any child
 * exited non-zero; the promise never rejects.
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
	outputStream?: Writable,
): Promise<number> {
	const { result } = concurrently(
		commands.map((command) => {
			return {
				name: command.label,
				command: buildShellCommand(
					process.execPath,
					resolveLocalBin(command.bin, cwd),
					command.args,
					process.platform,
				),
				env: command.env,
				prefixColor: PREFIX_COLOR[command.label],
			};
		}),
		{
			cwd,
			group: true,
			outputStream,
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
	}
}

async function spawnChild(command: ChildCommand, cwd: string): Promise<number> {
	const binJsPath = resolveLocalBin(command.bin, cwd);
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [binJsPath, ...command.args], {
			cwd,
			env: { ...process.env, ...command.env },
			stdio: "inherit",
		});
		announce(command);
		child.on("error", () => {
			resolve(1);
		});
		child.on("close", (code) => {
			resolve(code ?? 1);
		});
	});
}

async function runSequential(commands: Array<ChildCommand>, cwd: string): Promise<number> {
	let exitCode = 0;
	for (const command of commands) {
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
