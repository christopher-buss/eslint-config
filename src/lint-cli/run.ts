import concurrently from "concurrently";
import { isPackageExists } from "local-pkg";
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import path from "node:path";
import process from "node:process";

import { clearAllCaches, isCacheBusted, listDirtyFiles, normalizePath } from "./cache.ts";
import {
	buildShellCommand,
	composeEslintCommand,
	composeOxlintCommand,
	formatCommandLine,
} from "./command.ts";
import { computeWorkerCount, resolveWorkerLimits } from "./concurrency.ts";
import { cacheFileForMode } from "./constants.ts";
import { collectCacheBustFiles, collectLintableFiles } from "./files.ts";
import { applyTypeAwareInvalidation } from "./invalidation.ts";
import { parseArguments } from "./options.ts";
import { resolveAgentsFormatter, resolveLocalBin } from "./resolve.ts";
import type { ChildCommand, ComposeContext, LintCliOptions } from "./types.ts";
import { CliError } from "./types.ts";

/**
 * Whether the environment signals a CI run.
 *
 * @param environment - The environment variables to inspect.
 * @returns Whether CI is active.
 */
export function isCi(environment: NodeJS.ProcessEnv): boolean {
	const value = environment["CI"];
	return value !== undefined && value !== "" && value !== "false" && value !== "0";
}

/**
 * Parse, validate, compose and run the hybrid oxlint + ESLint invocation.
 *
 * @param argv - The argument slice (without the node/bin prefix).
 * @returns The process exit code.
 * @rejects {CliError} When the arguments are invalid or a tool is missing.
 */
export async function runLint(argv: Array<string>): Promise<number> {
	const options = parseArguments(argv);
	const cwd = process.cwd();
	const { env } = process;

	const runEslint = !options.oxlint;
	const runOxlint = !options.eslint;
	const oxlintTypeAware = runOxlint && options.oxlintTypeAware && options.typeAware !== "off";

	if (runOxlint && oxlintTypeAware && !isPackageExists("oxlint-tsgolint", { paths: [cwd] })) {
		throw new CliError(
			"oxlint-tsgolint is not installed, so oxlint cannot run type-aware rules. " +
				"Install oxlint-tsgolint, or pass --no-oxlint-type-aware to skip type-aware linting.",
		);
	}

	const concurrency = runEslint ? resolveEslintConcurrency(options, cwd, options.print) : "off";

	const context: ComposeContext = {
		agentsFormatterPath: options.agents ? resolveAgentsFormatter() : "",
		cacheLocation: cacheFileForMode(options.typeAware),
		ci: isCi(env),
		concurrency,
		oxlintTypeAware,
		paths: options.paths,
	};

	const commands: Array<ChildCommand> = [];
	if (runOxlint) {
		commands.push(composeOxlintCommand(options, context));
	}

	if (runEslint) {
		commands.push(composeEslintCommand(options, context));
	}

	if (options.print) {
		for (const command of commands) {
			process.stdout.write(`${formatCommandLine(command)}\n`);
		}

		return 0;
	}

	if (options.fix || commands.length === 1) {
		return runSequential(commands, cwd);
	}

	return runConcurrent(commands, cwd);
}

/**
 * Count the files ESLint will re-lint under the target paths, sizing the dirty
 * set as the union of the mtime/checksum-dirty files and the TypeScript builder
 * affected set. Busts the cache (unless `dryRun`) when a config change is
 * detected, treating all as dirty.
 *
 * The builder pass is side-effecting (it removes stale cache entries and
 * persists incremental state), so it is skipped entirely when `dryRun` is set
 * — this keeps `--print` free of side effects.
 *
 * @param options - The parsed CLI options.
 * @param cwd - The working directory.
 * @param dryRun - When true, never delete cache files or run the builder.
 * @returns The number of dirty files.
 */
function countDirty(options: LintCliOptions, cwd: string, dryRun: boolean): number {
	const files = collectLintableFiles(cwd, options.paths);
	if (!options.cache) {
		return files.length;
	}

	const cacheLocation = path.resolve(cwd, cacheFileForMode(options.typeAware));
	const bustFiles = collectCacheBustFiles(cwd);
	if (isCacheBusted(cacheLocation, bustFiles)) {
		if (!dryRun) {
			clearAllCaches(cwd);
		}

		return files.length;
	}

	const dirtyFiles = listDirtyFiles(cacheLocation, files, isCi(process.env));
	const dirty = new Set<string>();
	for (const file of dirtyFiles) {
		dirty.add(normalizePath(file));
	}

	// A `--type-aware=off` pass lints each file in isolation, so cross-file type
	// flow can't change its result and builder invalidation is unnecessary.
	if (!dryRun && options.typeAware !== "off") {
		const outcome = applyTypeAwareInvalidation({
			alreadyDirty: dirty,
			cacheLocation,
			cwd,
			environment: process.env,
			mode: options.typeAware,
			targetFiles: files,
		});
		if (outcome.busted) {
			return files.length;
		}

		for (const file of outcome.invalidated) {
			dirty.add(file);
		}
	}

	return dirty.size;
}

/**
 * Size ESLint's `--concurrency` from how many files it will actually re-lint.
 * Never writes the cache; when a config change busts it, deletes every cache
 * file (unless `dryRun`) and treats everything as dirty.
 *
 * @param options - The parsed CLI options.
 * @param cwd - The working directory.
 * @param dryRun - When true, never delete cache files.
 * @returns The resolved concurrency value.
 */
function resolveEslintConcurrency(
	options: LintCliOptions,
	cwd: string,
	dryRun: boolean,
): "off" | number {
	if (options.concurrency !== undefined) {
		return options.concurrency;
	}

	const dirtyCount = countDirty(options, cwd, dryRun);
	const { filesPerWorker, maxWorkers } = resolveWorkerLimits(process.env, availableParallelism());
	return computeWorkerCount({ dirtyCount, filesPerWorker, maxWorkers });
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
				prefixColor: command.label === "oxc" ? "magenta" : "blue",
			};
		}),
		{
			cwd,
			group: true,
			killOthersOn: ["failure"],
		},
	);

	try {
		await result;
		return 0;
	} catch {
		return 1;
	}
}
