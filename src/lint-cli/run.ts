// cspell:words lintable typeaware
import concurrently from "concurrently";
import { isPackageExists } from "local-pkg";
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import path from "node:path";
import process from "node:process";

import { isCi } from "../utils.ts";
import { clearAllCaches, isCacheBusted, listDirtyFiles, normalizePath } from "./cache.ts";
import {
	buildShellCommand,
	composeEslintCommand,
	composeOxlintCommand,
	formatCommandLine,
} from "./command.ts";
import {
	computeWorkerCount,
	resolveFastFilesPerWorker,
	resolveWorkerLimits,
} from "./concurrency.ts";
import { CACHE_FILE_DEFAULT, CACHE_FILE_FAST, CACHE_FILE_TYPE_AWARE } from "./constants.ts";
import { collectCacheBustFiles, collectLintableFiles, isTypeAwareFile } from "./files.ts";
import { applyTypeAwareInvalidation } from "./invalidation.ts";
import { parseArguments } from "./options.ts";
import { applyPackageJsonBust } from "./package-hash.ts";
import { resolveAgentsFormatter, resolveLocalBin } from "./resolve.ts";
import type { ChildCommand, ComposeContext, LintCliOptions, ToolLabel } from "./types.ts";
import { CliError } from "./types.ts";

/** Prefix colour per child label for `concurrently`; kept visually distinct. */
const PREFIX_COLOR: Record<ToolLabel, string> = {
	eslint: "blue",
	fast: "blue",
	oxc: "magenta",
	typed: "cyan",
};

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

/** Shared inputs for sizing a pass: where to look and whether to mutate. */
interface SizingContext {
	/** The working directory. */
	cwd: string;
	/** When true, never run the builder or delete cache files (`--print`). */
	dryRun: boolean;
	/** The process environment. */
	environment: NodeJS.ProcessEnv;
}

/** Builds an ESLint child command from a partial pass context. */
type EslintCommandBuilder = (context: Partial<ComposeContext>) => ChildCommand;

/** Inputs to the per-pass dirty-count computation. */
interface CountDirtyRequest {
	/** The cache file for this pass. */
	cacheFileName: string;
	/** The sizing context (cwd, environment, dry-run flag). */
	context: SizingContext;
	/**
	 * The type-aware invalidation to fold in. `"none"` skips the builder and
	 * the package.json bust (the fast pass); `"only"`/`"full"` run them.
	 */
	invalidation: "full" | "none" | "only";
	/** When true, size from TS/JS-family files only (the typed pass). */
	typeAwareOnly: boolean;
}

/**
 * Compose the child commands for the selected mode. Pure with respect to
 * `context.dryRun`: when set it never runs the TS builder, deletes caches or
 * skips the typed pass, keeping `--print` side-effect-free.
 *
 * The default local mode (no `--type-aware`, no `--fix`, not CI) runs three
 * children concurrently: oxlint, a fast syntactic ESLint pass and a type-aware
 * ESLint pass. The type-aware pass is skipped when nothing type-relevant is
 * dirty (see {@link sizeTypedPass}). Explicit `--type-aware`, `--fix` and CI
 * runs collapse to their single ESLint pass.
 *
 * @param options - The parsed CLI options.
 * @param context - The sizing context (cwd, environment, dry-run flag).
 * @returns The composed command plan.
 */
export function composeCommands(options: LintCliOptions, context: SizingContext): CommandPlan {
	const runEslint = !options.oxlint;
	const runOxlint = !options.eslint;
	const ci = isCi(context.environment);
	const oxlintTypeAware = runOxlint && options.oxlintTypeAware && options.typeAware !== "off";
	const agentsFormatterPath = options.agents ? resolveAgentsFormatter() : "";

	const commands: Array<ChildCommand> = [];
	let notice: string | undefined;

	if (runOxlint) {
		commands.push(
			composeOxlintCommand(options, {
				agentsFormatterPath,
				cacheLocation: "",
				ci,
				concurrency: "off",
				eslintLabel: "eslint",
				oxlintTypeAware,
				paths: options.paths,
				typeAwareEnv: undefined,
			}),
		);
	}

	if (!runEslint) {
		return { commands, notice };
	}

	function build(overrides: Partial<ComposeContext>): ChildCommand {
		return composeEslintCommand(options, {
			agentsFormatterPath,
			cacheLocation: CACHE_FILE_DEFAULT,
			ci,
			concurrency: "off",
			eslintLabel: "eslint",
			oxlintTypeAware,
			paths: options.paths,
			typeAwareEnv: undefined,
			...overrides,
		});
	}

	if (ci || options.fix || options.typeAware === "full") {
		// The full config (env unset, `.eslintcache`): --fix writers, CI (needs
		// unused-disable reporting), and the explicit `full` escape hatch.
		commands.push(
			build({
				cacheLocation: CACHE_FILE_DEFAULT,
				concurrency: sizeFullPass(options, context),
			}),
		);
		return { commands, notice };
	}

	if (options.typeAware === "off") {
		commands.push(fastPassCommand(build, options, context));
		return { commands, notice };
	}

	if (options.typeAware === "only") {
		const { concurrency } = sizeTypedPass(options, context);
		commands.push(typedPassCommand(build, concurrency));
		return { commands, notice };
	}

	// Default: fast pass ∥ typed pass, skipping the typed pass when nothing
	// type-relevant changed.
	commands.push(fastPassCommand(build, options, context));

	const { concurrency, dirtyCount } = sizeTypedPass(options, context);
	if (dirtyCount === 0 && !context.dryRun) {
		notice =
			"isentinel-lint: skipping the type-aware ESLint pass; no type-relevant files " +
			"changed since the last run.\n";
	} else {
		commands.push(typedPassCommand(build, concurrency));
	}

	return { commands, notice };
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
	const oxlintTypeAware = runOxlint && options.oxlintTypeAware && options.typeAware !== "off";

	if (runOxlint && oxlintTypeAware && !isPackageExists("oxlint-tsgolint", { paths: [cwd] })) {
		throw new CliError(
			"oxlint-tsgolint is not installed, so oxlint cannot run type-aware rules. " +
				"Install oxlint-tsgolint, or pass --no-oxlint-type-aware to skip type-aware linting.",
		);
	}

	const { commands, notice } = composeCommands(options, {
		cwd,
		dryRun: options.print,
		environment,
	});

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

/**
 * Count the files a pass will re-lint: the union of the mtime/checksum-dirty
 * files and the TypeScript builder's affected set (for type-aware passes),
 * restricted to the pass's own cache and extension family.
 *
 * For type-aware passes it first busts the type-aware caches when the root
 * package.json resolution surface changed, then runs the builder. A resolved
 * `.json` edit still propagates: the builder reads its file set from tsconfig
 * (not `targetFiles`), so a `resolveJsonModule` import flags its `.ts`
 * importers as affected even though the `.json` file itself is filtered out of
 * `targetFiles` here — the `.json` never enters the type-aware cache, so
 * removing it would be a no-op.
 *
 * @param options - The parsed CLI options.
 * @param request - The per-pass count request.
 * @returns The number of dirty files.
 */
function countDirty(
	options: LintCliOptions,
	{ cacheFileName, context, invalidation, typeAwareOnly }: CountDirtyRequest,
): number {
	const { cwd, dryRun, environment } = context;
	const all = collectLintableFiles(cwd, options.paths);
	const files = typeAwareOnly ? all.filter(isTypeAwareFile) : all;
	if (!options.cache) {
		return files.length;
	}

	const cacheLocation = path.resolve(cwd, cacheFileName);
	const typeAware = invalidation !== "none";

	// Bust the type-aware caches (never `.eslintcache-fast`) when the root
	// package.json resolution surface changed; a missing cache below then reads
	// as fully dirty.
	if (typeAware && !dryRun) {
		applyPackageJsonBust(cwd);
	}

	const bustFiles = collectCacheBustFiles(cwd);
	if (isCacheBusted(cacheLocation, bustFiles)) {
		if (!dryRun) {
			clearAllCaches(cwd);
		}

		return files.length;
	}

	const dirty = new Set<string>();
	const dirtyFiles = listDirtyFiles(cacheLocation, files, isCi(environment));
	for (const file of dirtyFiles) {
		dirty.add(normalizePath(file));
	}

	if (typeAware && !dryRun) {
		const outcome = applyTypeAwareInvalidation({
			alreadyDirty: dirty,
			cacheLocation,
			cwd,
			environment,
			mode: invalidation === "only" ? "only" : undefined,
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
 * Size the fast pass from its own dirty count against `.eslintcache-fast` over
 * every lintable extension. The fast pass lints in isolation, so it never runs
 * the TS builder and uses the higher {@link resolveFastFilesPerWorker}
 * break-even.
 *
 * @param options - The parsed CLI options.
 * @param context - The sizing context.
 * @returns The resolved concurrency value.
 */
function sizeFastPass(options: LintCliOptions, context: SizingContext): "off" | number {
	if (options.concurrency !== undefined) {
		return options.concurrency;
	}

	const dirtyCount = countDirty(options, {
		cacheFileName: CACHE_FILE_FAST,
		context,
		invalidation: "none",
		typeAwareOnly: false,
	});
	const { maxWorkers } = resolveWorkerLimits(context.environment, availableParallelism());
	return computeWorkerCount({
		dirtyCount,
		filesPerWorker: resolveFastFilesPerWorker(context.environment),
		maxWorkers,
	});
}

/**
 * Build the fast (syntactic, `ESLINT_TYPE_AWARE=off`) ESLint pass command.
 *
 * @param build - The pass-context command builder.
 * @param options - The parsed CLI options.
 * @param context - The sizing context.
 * @returns The fast-pass child command.
 */
function fastPassCommand(
	build: EslintCommandBuilder,
	options: LintCliOptions,
	context: SizingContext,
): ChildCommand {
	return build({
		cacheLocation: CACHE_FILE_FAST,
		concurrency: sizeFastPass(options, context),
		eslintLabel: "fast",
		typeAwareEnv: "off",
	});
}

/**
 * Build the type-aware (`ESLINT_TYPE_AWARE=only`) ESLint pass command.
 *
 * @param build - The pass-context command builder.
 * @param concurrency - The resolved concurrency for the pass.
 * @returns The typed-pass child command.
 */
function typedPassCommand(build: EslintCommandBuilder, concurrency: "off" | number): ChildCommand {
	return build({
		cacheLocation: CACHE_FILE_TYPE_AWARE,
		concurrency,
		eslintLabel: "typed",
		typeAwareEnv: "only",
	});
}

/**
 * Size the type-aware pass from its own dirty count against
 * `.eslintcache-typeaware`, restricted to TS/JS-family files and computed after
 * builder invalidation runs. Returns the dirty count so the caller can skip the
 * pass when nothing type-relevant changed.
 *
 * @param options - The parsed CLI options.
 * @param context - The sizing context.
 * @returns The resolved concurrency and the (post-invalidation) dirty count.
 */
function sizeTypedPass(
	options: LintCliOptions,
	context: SizingContext,
): { concurrency: "off" | number; dirtyCount: number } {
	const dirtyCount = countDirty(options, {
		cacheFileName: CACHE_FILE_TYPE_AWARE,
		context,
		invalidation: "only",
		typeAwareOnly: true,
	});
	if (options.concurrency !== undefined) {
		return { concurrency: options.concurrency, dirtyCount };
	}

	const { filesPerWorker, maxWorkers } = resolveWorkerLimits(
		context.environment,
		availableParallelism(),
	);
	return {
		concurrency: computeWorkerCount({ dirtyCount, filesPerWorker, maxWorkers }),
		dirtyCount,
	};
}

/**
 * Size the full-config pass from every dirty lintable file against
 * `.eslintcache`, running builder invalidation for the full type-aware config.
 *
 * @param options - The parsed CLI options.
 * @param context - The sizing context.
 * @returns The resolved concurrency value.
 */
function sizeFullPass(options: LintCliOptions, context: SizingContext): "off" | number {
	if (options.concurrency !== undefined) {
		return options.concurrency;
	}

	const dirtyCount = countDirty(options, {
		cacheFileName: CACHE_FILE_DEFAULT,
		context,
		invalidation: "full",
		typeAwareOnly: false,
	});
	const { filesPerWorker, maxWorkers } = resolveWorkerLimits(
		context.environment,
		availableParallelism(),
	);
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
