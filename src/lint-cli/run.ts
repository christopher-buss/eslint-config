// cspell:words lintable typeaware
import concurrently from "concurrently";
import { isPackageExists } from "local-pkg";
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import path from "node:path";
import process from "node:process";

import { applyHashBust, CONFIG_DRIFT, PACKAGE_RESOLUTION } from "./bust.ts";
import type { DirtyCache } from "./cache.ts";
import { isCacheStale, maxMtimeMs, normalizePath, openCache, sweepStaleCaches } from "./cache.ts";
import {
	buildShellCommand,
	composeEslintCommand,
	composeOxlintCommand,
	formatCommandLine,
} from "./command.ts";
import { computeWorkerCount, resolveWorkerLimits } from "./concurrency.ts";
import { computeConfigHash } from "./config-hash.ts";
import { cacheFileFor } from "./constants.ts";
import { resolveRunContext } from "./context.ts";
import type { RunContext } from "./context.ts";
import { collectRepoFiles, oxlintTargets, withoutIgnored } from "./files.ts";
import type { RepoFiles } from "./files.ts";
import { resolveOxlintRun } from "./hybrid.ts";
import { resolveIgnoredFiles } from "./ignored.ts";
import { applyTypeAwareInvalidation } from "./invalidation.ts";
import { parseArguments } from "./options.ts";
import { computePackageJsonHash } from "./package-hash.ts";
import { maxWorkersFor, selectPasses, TYPED_PASS } from "./passes.ts";
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

/** The stderr notice emitted when a lint target resolves outside the cwd. */
const OUTSIDE_CWD_NOTICE =
	"isentinel-lint: a lint target resolves outside the working directory; sizing " +
	"conservatively and not auto-skipping the type-aware pass.\n";

/** One planned ESLint pass: its descriptor, sizing and run/skip decision. */
export interface PassPlan {
	/**
	 * The pass's resolved cache file name for this run: its base name plus the
	 * config-variant key.
	 */
	cacheFile: string;
	/** The concurrency resolved for the pass. */
	concurrency: "off" | number;
	/** The pass descriptor (cache base name, label, type-aware env, sizing). */
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
	/** The paths the oxlint child receives (see `oxlintTargets`). */
	oxlintPaths: Array<string>;
	/**
	 * A stderr warning about the oxlint decision (non-hybrid config drop or an
	 * undeterminable hybrid status), or `undefined`.
	 */
	oxlintReason: string | undefined;
	/** Whether oxlint receives `--type-aware`. */
	oxlintTypeAware: boolean;
	/** The ESLint passes, in run order (empty for oxlint-only runs). */
	passes: Array<PassPlan>;
	/**
	 * Whether a lint target resolved outside the cwd, so the passes were sized
	 * conservatively and the typed-pass auto-skip was disabled. Emits a notice.
	 */
	targetsOutsideCwd: boolean;
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

/** Shared inputs threaded into {@link sizePass}, alongside the run context. */
interface SizePassContext {
	/**
	 * The cache files the up-front stale sweep deleted (absolute paths). A pass
	 * whose cache is in here counts every file as dirty and skips the builder —
	 * everything re-lints regardless.
	 */
	clearedCaches: ReadonlySet<string>;
	files: RepoFiles;
	limits: ReturnType<typeof resolveWorkerLimits>;
	multiPass: boolean;
	newestBustMtime: number | undefined;
	options: LintCliOptions;
	run: RunContext;
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
 * @param run - The run context (cwd, variant key, environment, mutate).
 * @returns The run plan.
 */
export function plan(options: LintCliOptions, run: RunContext): RunPlan {
	const { ci, cwd, environment, mutate } = run;
	const runEslint = !options.oxlint;
	const oxlintTypeAware = resolveOxlintTypeAware(options);
	const agentsFormatterPath = options.agents ? resolveAgentsFormatter() : "";

	// Targets oxlint cannot lint (a `package.json`-only commit, say) are dropped,
	// and oxlint is skipped outright when nothing survives — handed only such
	// paths it exits non-zero on "No files found to lint", failing a hook over a
	// file it was never going to lint. The default target `.` always survives.
	const oxlintPaths = oxlintTargets(cwd, options.paths);
	const runOxlint = !options.eslint && oxlintPaths.length > 0;

	if (!runEslint) {
		return {
			agentsFormatterPath,
			ci,
			oxlint: runOxlint,
			oxlintPaths,
			oxlintReason: undefined,
			oxlintTypeAware,
			passes: [],
			targetsOutsideCwd: false,
		};
	}

	const descriptors = selectPasses(options, ci);
	const files = collectRepoFiles(cwd, options.paths);
	const newestBustMtime = maxMtimeMs(files.bustFiles);
	const limits = resolveWorkerLimits(environment, availableParallelism());

	// Hybrid gate: when both engines would run, oxlint only runs if the resolved
	// ESLint config is hybrid (`oxlint: true`); otherwise the two engines would
	// double-lint every mapped rule. Decided here (before any child spawns) so
	// `--fix` never runs oxlint's fixes against a non-hybrid config.
	const oxlintDecision = resolveOxlintRun(run, { files, runEslint, runOxlint });

	// Evaluate every bust up front, before sizing any pass, then clear once. This
	// ordering is load-bearing: a per-pass staleness check that cleared caches
	// mid-loop could delete a cache an earlier pass was already sized against,
	// under-provisioning that pass's workers. Only meaningful with caching on;
	// `--no-cache` never touches cache state, and `--print` (mutate=false) never
	// mutates.
	//
	// The package.json bust runs first and deletes only this variant's type-aware
	// caches (a syntactic lint is immune to resolution changes), so it does NOT
	// feed `clearedCaches` — the fast cache survives it. The mtime sweep below is
	// the wholesale one, and it covers every variant on disk, not just the ones
	// this run selected.
	const canMutateCaches = mutate && options.cache;
	const hasTypeAwarePass = descriptors.some((descriptor) => descriptor.invalidation !== "none");

	// One hash per run, shared by the drift bust below and the ignore-set memo:
	// both answer "has the resolved config changed since last time", and the
	// closure walk is not worth doing twice. Only meaningful with caching on —
	// `--no-cache` counts every file dirty regardless.
	const configHash = options.cache ? computeConfigHash(cwd, files.configFiles) : undefined;

	if (canMutateCaches) {
		// Config drift through a module `eslint.config.*` imports shifts ESLint's
		// per-entry `hashOfConfig` (a full re-lint) but touches no bust file, so
		// the mtime dirty count would size `--concurrency off` for a serial full
		// re-lint. Content-hash the config's local import closure and delete all
		// three of this variant's caches when it changed. Applies to every pass
		// (a config change can alter a syntactic lint), so it runs before the
		// type-aware-only package.json bust.
		applyHashBust(run, CONFIG_DRIFT, configHash);
	}

	if (canMutateCaches && hasTypeAwarePass) {
		applyHashBust(run, PACKAGE_RESOLUTION, computePackageJsonHash(cwd));
	}

	const clearedCaches = new Set(canMutateCaches ? sweepStaleCaches(cwd, newestBustMtime) : []);

	// Drop the files ESLint declines to lint before anything sizes from them:
	// they never enter a cache, so they would otherwise read as dirty forever
	// and hold the typed pass's dirty count above zero (see
	// `resolveIgnoredFiles`).
	const ignored = resolveIgnoredFiles(run, configHash, files.lintable);
	const sizingFiles = withoutIgnored(files, ignored);

	const multiPass = descriptors.length > 1;
	const passes = descriptors.map((descriptor) => {
		return sizePass(descriptor, {
			clearedCaches,
			files: sizingFiles,
			limits,
			multiPass,
			newestBustMtime,
			options,
			run,
		});
	});

	return {
		agentsFormatterPath,
		ci,
		oxlint: oxlintDecision.run,
		oxlintPaths,
		oxlintReason: oxlintDecision.reason,
		oxlintTypeAware,
		passes,
		targetsOutsideCwd: files.targetsOutsideCwd,
	};
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
	const notices: Array<string> = [];

	if (runPlan.oxlintReason !== undefined) {
		notices.push(runPlan.oxlintReason);
	}

	if (runPlan.targetsOutsideCwd) {
		notices.push(OUTSIDE_CWD_NOTICE);
	}

	if (runPlan.oxlint) {
		commands.push(
			composeOxlintCommand(options, {
				oxlintTypeAware: runPlan.oxlintTypeAware,
				paths: runPlan.oxlintPaths,
			}),
		);
	}

	for (const pass of runPlan.passes) {
		if (!pass.shouldRun) {
			if (pass.skipReason !== undefined) {
				notices.push(pass.skipReason);
			}

			continue;
		}

		commands.push(
			composeEslintCommand(options, {
				agentsFormatterPath: runPlan.agentsFormatterPath,
				cacheLocation: pass.cacheFile,
				ci: runPlan.ci,
				concurrency: pass.concurrency,
				eslintLabel: pass.descriptor.label,
				paths: options.paths,
				typeAwareEnv: pass.descriptor.typeAwareEnv,
			}),
		);
	}

	return { commands, notice: notices.length > 0 ? notices.join("") : undefined };
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
 * @param cwd - The working directory (defaults to `process.cwd()`; injected in tests).
 * @param environment - The process environment (defaults to `process.env`).
 * @returns The process exit code.
 * @rejects {CliError} When the arguments are invalid or a tool is missing.
 */
export async function runLint(
	argv: Array<string>,
	cwd: string = process.cwd(),
	environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
	const options = parseArguments(argv, environment);

	const run = resolveRunContext(cwd, environment, !options.print);
	const { commands, notice } = compose(plan(options, run), options);

	if (options.print) {
		for (const command of commands) {
			process.stdout.write(`${formatCommandLine(command)}\n`);
		}

		return 0;
	}

	// Only require oxlint-tsgolint when an oxlint child that actually carries
	// `--type-aware` survived composition. The hybrid gate may have dropped
	// oxlint (non-hybrid config), in which case the run degrades to ESLint-only
	// rather than hard-erroring; `--print` returned above and never errors.
	// Explicit `--oxlint` bypasses the gate but still composes the child, so the
	// check still applies to it.
	const needsTsgolint = commands.some(
		(command) => command.bin === "oxlint" && command.args.includes("--type-aware"),
	);
	if (needsTsgolint && !isPackageExists("oxlint-tsgolint", { paths: [cwd] })) {
		throw new CliError(
			"oxlint-tsgolint is not installed, so oxlint cannot run type-aware rules. " +
				"Install oxlint-tsgolint, or pass --no-oxlint-type-aware to skip type-aware linting.",
		);
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
	{ clearedCaches, run }: SizePassContext,
): number {
	if (clearedCaches.has(cacheLocation)) {
		// The up-front sweep already deleted this pass's cache (see `plan`), so
		// every file is dirty and the builder would be pure waste — everything
		// re-lints.
		return targetFiles.length;
	}

	const cache: DirtyCache | undefined = openCache(cacheLocation, run.ci);
	const dirty = new Set(
		(cache?.getUpdatedFiles(targetFiles) ?? targetFiles).map((file) => normalizePath(file)),
	);

	if (descriptor.invalidation !== "none") {
		const outcome = applyTypeAwareInvalidation(run, {
			alreadyDirty: dirty,
			cache,
			cacheLocation,
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
	{ newestBustMtime, run }: SizePassContext,
): number {
	if (isCacheStale(cacheLocation, newestBustMtime)) {
		return targetFiles.length;
	}

	const cache = openCache(cacheLocation, run.ci);
	return (cache?.getUpdatedFiles(targetFiles) ?? targetFiles).length;
}

/**
 * Count the files a pass will re-lint. Routes on `mutate`: the mutating path
 * clears stale caches and folds builder invalidation into the count (reusing
 * one loaded cache for the dirty query and the surgical removal); the read-only
 * path only reports the mtime/checksum-dirty files.
 *
 * @param descriptor - The pass being sized.
 * @param cacheFile - The pass's keyed cache file name.
 * @param context - The shared sizing inputs.
 * @returns The number of dirty files.
 */
function passDirtyCount(
	descriptor: PassDescriptor,
	cacheFile: string,
	context: SizePassContext,
): number {
	const targetFiles = descriptor.typeAwareOnly ? context.files.typeAware : context.files.lintable;
	if (!context.options.cache) {
		return targetFiles.length;
	}

	const cacheLocation = path.resolve(context.run.cwd, cacheFile);
	return context.run.mutate
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
	const cacheFile = cacheFileFor(descriptor.cacheFileBase, context.run.key);
	const dirtyCount = passDirtyCount(descriptor, cacheFile, context);
	const conservative = context.files.targetsOutsideCwd;
	const filesPerWorker = descriptor.filesPerWorker(context.limits, context.run.environment);
	const maxWorkers = maxWorkersFor(descriptor, context.limits);

	// Outside-cwd targets are absent from the cwd-relative listing, so the dirty
	// count under-counts them — size for the worker cap instead (maxWorkers *
	// filesPerWorker ceils back to exactly maxWorkers).
	const sizingDirtyCount = conservative ? maxWorkers * filesPerWorker : dirtyCount;

	const concurrency =
		context.options.concurrency ??
		computeWorkerCount({ dirtyCount: sizingDirtyCount, filesPerWorker, maxWorkers });

	// The typed pass may only auto-skip when the dirty count is trustworthy; an
	// outside-cwd target makes it unknowable, so never skip in that case.
	//
	// A config change reaching the resolved config through a module the
	// `eslint.config.*` imports busts this variant's caches up front (see
	// `applyConfigDriftBust` in `plan`), so the dirty count reflects it and the
	// pass is not wrongly skipped. Residual escape hatch for the cases that
	// misses (dynamic `import()`, non-file config inputs): touch the config, or
	// run with `--no-cache`.
	const canSkip =
		context.run.mutate && context.multiPass && descriptor === TYPED_PASS && !conservative;
	if (canSkip && dirtyCount === 0) {
		return {
			cacheFile,
			concurrency,
			descriptor,
			shouldRun: false,
			skipReason: TYPED_SKIP_NOTICE,
		};
	}

	return { cacheFile, concurrency, descriptor, shouldRun: true, skipReason: undefined };
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
