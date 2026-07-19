// cspell:words lintable typeaware
import concurrently from "concurrently";
import { isPackageExists } from "local-pkg";
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import path from "node:path";
import process from "node:process";

import { isCi } from "../utils.ts";
import type { DirtyCache } from "./cache.ts";
import { clearAllCaches, isCacheStale, maxMtimeMs, normalizePath, openCache } from "./cache.ts";
import {
	buildShellCommand,
	composeEslintCommand,
	composeOxlintCommand,
	formatCommandLine,
} from "./command.ts";
import { computeWorkerCount, resolveWorkerLimits } from "./concurrency.ts";
import { collectRepoFiles } from "./files.ts";
import type { RepoFiles } from "./files.ts";
import { applyTypeAwareInvalidation } from "./invalidation.ts";
import { parseArguments } from "./options.ts";
import { applyPackageJsonBust } from "./package-hash.ts";
import { selectPasses, TYPED_PASS } from "./passes.ts";
import type { PassDescriptor } from "./passes.ts";
import { resolveAgentsFormatter, resolveLocalBin } from "./resolve.ts";
import type { ChildCommand, LintCliOptions, ToolLabel } from "./types.ts";
import { CliError } from "./types.ts";

/** Prefix colour per child label for `concurrently`; kept visually distinct. */
const PREFIX_COLOR: Record<ToolLabel, string> = {
	eslint: "blue",
	fast: "blue",
	oxc: "magenta",
	typed: "cyan",
};

/** The stderr notice emitted when the type-aware pass is skipped. */
const TYPED_SKIP_NOTICE =
	"isentinel-lint: skipping the type-aware ESLint pass; no type-relevant files " +
	"changed since the last run.\n";

/** Where a run looks, and whether it may mutate (planning `dryRun` inverse). */
export interface SizingContext {
	/** The working directory. */
	cwd: string;
	/** When true, never run the builder or delete cache files (`--print`). */
	dryRun: boolean;
	/** The process environment. */
	environment: NodeJS.ProcessEnv;
}

/** One planned ESLint pass: its descriptor, sizing and run/skip decision. */
export interface PassPlan {
	/** The concurrency resolved for the pass. */
	concurrency: "off" | number;
	/** The pass descriptor (cache file, label, type-aware env, sizing). */
	descriptor: PassDescriptor;
	/** Whether the pass runs; false when auto-skipped. */
	shouldRun: boolean;
	/** The stderr notice to emit when skipped, else undefined. */
	skipReason: string | undefined;
}

/**
 * A composed run as plain data: all I/O and mutation happen once in
 * {@link plan} to build it, then {@link compose} turns it into child commands
 * with no further I/O.
 */
export interface RunPlan {
	/**
	 * Absolute path to the agent ESLint formatter (empty unless `--agents`).
	 */
	agentsFormatterPath: string;
	/** Whether the run is in CI. */
	ci: boolean;
	/** Whether the oxlint child runs. */
	oxlint: boolean;
	/** Whether oxlint receives `--type-aware`. */
	oxlintTypeAware: boolean;
	/** The ESLint passes, in run order (empty for oxlint-only runs). */
	passes: Array<PassPlan>;
}

/** A composed run: the child commands plus an optional stderr notice. */
export interface CommandPlan {
	/** The child commands to run (or print). */
	commands: Array<ChildCommand>;
	/**
	 * A stderr line to emit before running (for example the skipped typed
	 * pass).
	 */
	notice: string | undefined;
}

/** Shared inputs threaded into {@link sizePass}. */
interface SizePassContext {
	cwd: string;
	environment: NodeJS.ProcessEnv;
	files: RepoFiles;
	limits: ReturnType<typeof resolveWorkerLimits>;
	multiPass: boolean;
	mutate: boolean;
	newestBustMtime: number | undefined;
	options: LintCliOptions;
}

/**
 * Plan the run: collect the repo file list once, apply the package.json and
 * mtime busts and TypeScript builder invalidation, size each pass and decide
 * which run. All I/O and mutation happen here, exactly once. When `mutate` is
 * false (`--print`) the whole mutation step is skipped — no builder, no cache
 * deletion, no state writes and no auto-skip — while still sizing from the
 * on-disk caches. The returned value is plain data.
 *
 * @param options - The parsed CLI options.
 * @param cwd - The working directory.
 * @param environment - The process environment.
 * @param mutate - Whether the plan may mutate (false for `--print`).
 * @returns The run plan.
 */
export function plan(
	options: LintCliOptions,
	cwd: string,
	environment: NodeJS.ProcessEnv,
	mutate: boolean,
): RunPlan {
	const ci = isCi(environment);
	const runOxlint = !options.eslint;
	const runEslint = !options.oxlint;
	const oxlintTypeAware = resolveOxlintTypeAware(options);
	const agentsFormatterPath = options.agents ? resolveAgentsFormatter() : "";

	if (!runEslint) {
		return { agentsFormatterPath, ci, oxlint: runOxlint, oxlintTypeAware, passes: [] };
	}

	const descriptors = selectPasses(options, ci);
	const files = collectRepoFiles(cwd, options.paths);
	const newestBustMtime = maxMtimeMs(files.bustFiles);
	const limits = resolveWorkerLimits(environment, availableParallelism());

	// The one mutation gate: bust the type-aware caches when the root
	// package.json resolution surface changed. Per-pass cache clearing and
	// builder invalidation follow inside `sizePass`, also gated by `mutate`.
	// Only meaningful with caching on; `--no-cache` never touches cache state.
	const hasTypeAwarePass = descriptors.some((descriptor) => descriptor.invalidation !== "none");
	if (mutate && hasTypeAwarePass && options.cache) {
		applyPackageJsonBust(cwd);
	}

	const multiPass = descriptors.length > 1;
	const passes = descriptors.map((descriptor) => {
		return sizePass(descriptor, {
			cwd,
			environment,
			files,
			limits,
			multiPass,
			mutate,
			newestBustMtime,
			options,
		});
	});

	return { agentsFormatterPath, ci, oxlint: runOxlint, oxlintTypeAware, passes };
}

/**
 * Turn a {@link RunPlan} into child commands. Pure: no I/O and no mutation, so
 * it is safe to run for `--print`.
 *
 * @param runPlan - The planned run.
 * @param options - The parsed CLI options (paths and per-tool args).
 * @returns The composed command plan.
 */
export function compose(runPlan: RunPlan, options: LintCliOptions): CommandPlan {
	const commands: Array<ChildCommand> = [];
	let notice: string | undefined;

	if (runPlan.oxlint) {
		commands.push(
			composeOxlintCommand(options, {
				oxlintTypeAware: runPlan.oxlintTypeAware,
				paths: options.paths,
			}),
		);
	}

	for (const pass of runPlan.passes) {
		if (!pass.shouldRun) {
			notice = pass.skipReason;
			continue;
		}

		commands.push(
			composeEslintCommand(options, {
				agentsFormatterPath: runPlan.agentsFormatterPath,
				cacheLocation: pass.descriptor.cacheFile,
				ci: runPlan.ci,
				concurrency: pass.concurrency,
				eslintLabel: pass.descriptor.label,
				paths: options.paths,
				typeAwareEnv: pass.descriptor.typeAwareEnv,
			}),
		);
	}

	return { commands, notice };
}

/**
 * Compose the child commands for the selected mode. Compatibility wrapper over
 * {@link plan} + {@link compose}; `context.dryRun` maps to a non-mutating plan.
 *
 * @param options - The parsed CLI options.
 * @param context - The sizing context (cwd, environment, dry-run flag).
 * @returns The composed command plan.
 */
export function composeCommands(options: LintCliOptions, context: SizingContext): CommandPlan {
	return compose(plan(options, context.cwd, context.environment, !context.dryRun), options);
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
export async function runConcurrent(commands: Array<ChildCommand>, cwd: string): Promise<number> {
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
	const environment = process.env;

	const runOxlint = !options.eslint;
	const oxlintTypeAware = resolveOxlintTypeAware(options);
	if (runOxlint && oxlintTypeAware && !isPackageExists("oxlint-tsgolint", { paths: [cwd] })) {
		throw new CliError(
			"oxlint-tsgolint is not installed, so oxlint cannot run type-aware rules. " +
				"Install oxlint-tsgolint, or pass --no-oxlint-type-aware to skip type-aware linting.",
		);
	}

	const { commands, notice } = compose(plan(options, cwd, environment, !options.print), options);

	if (options.print) {
		for (const command of commands) {
			process.stdout.write(`${formatCommandLine(command)}\n`);
		}

		return 0;
	}

	if (notice !== undefined) {
		process.stderr.write(notice);
	}

	if (options.fix || commands.length <= 1) {
		return runSequential(commands, cwd);
	}

	return runConcurrent(commands, cwd);
}

function resolveOxlintTypeAware(options: LintCliOptions): boolean {
	return !options.eslint && options.oxlintTypeAware && options.typeAware !== "off";
}

/**
 * Dirty count for a real run: clear the cache wholesale when stale, then fold
 * TS builder invalidation in, reusing a single loaded cache for the dirty query
 * and the surgical entry removal.
 *
 * @param descriptor - The pass being sized.
 * @param cacheLocation - The resolved cache file path.
 * @param targetFiles - The candidate files for this pass.
 * @param context - The shared sizing inputs.
 * @returns The number of dirty files.
 */
function mutatingDirtyCount(
	descriptor: PassDescriptor,
	cacheLocation: string,
	targetFiles: Array<string>,
	{ cwd, environment, newestBustMtime }: SizePassContext,
): number {
	if (isCacheStale(cacheLocation, newestBustMtime)) {
		clearAllCaches(cwd);
		return targetFiles.length;
	}

	const cache: DirtyCache | undefined = openCache(cacheLocation, isCi(environment));
	const dirty = new Set(
		(cache?.getUpdatedFiles(targetFiles) ?? targetFiles).map((file) => normalizePath(file)),
	);

	if (descriptor.invalidation !== "none") {
		const outcome = applyTypeAwareInvalidation({
			alreadyDirty: dirty,
			cache,
			cacheLocation,
			cwd,
			environment,
			mode: descriptor.invalidation === "only" ? "only" : undefined,
			targetFiles,
		});
		if (outcome.busted) {
			return targetFiles.length;
		}

		for (const file of outcome.invalidated) {
			dirty.add(file);
		}
	}

	return dirty.size;
}

/**
 * Dirty count for `--print`: reflect cache staleness but never delete it, and
 * never run the builder. Only the mtime/checksum-dirty files count.
 *
 * @param cacheLocation - The resolved cache file path.
 * @param targetFiles - The candidate files for this pass.
 * @param context - The shared sizing inputs.
 * @returns The number of dirty files.
 */
function readOnlyDirtyCount(
	cacheLocation: string,
	targetFiles: Array<string>,
	{ environment, newestBustMtime }: SizePassContext,
): number {
	if (isCacheStale(cacheLocation, newestBustMtime)) {
		return targetFiles.length;
	}

	const cache = openCache(cacheLocation, isCi(environment));
	return (cache?.getUpdatedFiles(targetFiles) ?? targetFiles).length;
}

/**
 * Count the files a pass will re-lint. Routes on `mutate`: the mutating path
 * clears stale caches and folds builder invalidation into the count (reusing
 * one loaded cache for the dirty query and the surgical removal); the read-only
 * path only reports the mtime/checksum-dirty files.
 *
 * @param descriptor - The pass being sized.
 * @param context - The shared sizing inputs.
 * @returns The number of dirty files.
 */
function passDirtyCount(descriptor: PassDescriptor, context: SizePassContext): number {
	const targetFiles = descriptor.typeAwareOnly ? context.files.typeAware : context.files.lintable;
	if (!context.options.cache) {
		return targetFiles.length;
	}

	const cacheLocation = path.resolve(context.cwd, descriptor.cacheFile);
	return context.mutate
		? mutatingDirtyCount(descriptor, cacheLocation, targetFiles, context)
		: readOnlyDirtyCount(cacheLocation, targetFiles, context);
}

/**
 * Size one pass: count its dirty files, resolve concurrency and decide whether
 * it runs. The default-mode type-aware pass is skipped when nothing
 * type-relevant is dirty; an explicit single-pass mode never skips.
 *
 * @param descriptor - The pass being sized.
 * @param context - The shared sizing inputs.
 * @returns The planned pass.
 */
function sizePass(descriptor: PassDescriptor, context: SizePassContext): PassPlan {
	const dirtyCount = passDirtyCount(descriptor, context);

	const concurrency =
		context.options.concurrency ??
		computeWorkerCount({
			dirtyCount,
			filesPerWorker: descriptor.filesPerWorker(context.limits, context.environment),
			maxWorkers: context.limits.maxWorkers,
		});

	const canSkip = context.mutate && context.multiPass && descriptor === TYPED_PASS;
	if (canSkip && dirtyCount === 0) {
		return { concurrency, descriptor, shouldRun: false, skipReason: TYPED_SKIP_NOTICE };
	}

	return { concurrency, descriptor, shouldRun: true, skipReason: undefined };
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
