import concurrently from "concurrently";
import { spawn } from "node:child_process";
import process from "node:process";

import type { ChildCommand, ToolLabel } from "../cli/types.ts";
import { resolveLocalBin } from "./resolve.ts";
import { buildShellCommand } from "./shell.ts";

/** Prefix colour per child label for `concurrently`; kept visually distinct. */
const PREFIX_COLOR: Record<ToolLabel, string> = {
	eslint: "blue",
	fast: "blue",
	oxc: "magenta",
	typed: "cyan",
};

/**
 * Run the composed children and aggregate their exit codes.
 *
 * Sequential when the caller asks for it — `--fix` must not have two children
 * writing the same files at once, and a lone child gains nothing from the
 * concurrently harness. Otherwise every child runs at once. Either way all of
 * them run to completion: an ordinary lint failure in one no longer kills its
 * siblings, so the user keeps every result. The returned code is non-zero when
 * any child exited non-zero.
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
	return sequential ? runSequential(commands, cwd) : runConcurrent(commands, cwd);
}

/**
 * Run every command concurrently to completion and aggregate their exit codes.
 * Unlike the previous `killOthersOn: ["failure"]` behaviour, an ordinary lint
 * failure in one child no longer kills its siblings — each runs to the end so
 * the user keeps every result. The returned code is non-zero when any child
 * exited non-zero.
 *
 * @param commands - The child commands to run.
 * @param cwd - The working directory.
 * @returns The aggregated exit code.
 */
async function runConcurrent(commands: Array<ChildCommand>, cwd: string): Promise<number> {
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
		},
	);

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
