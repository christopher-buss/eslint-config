import { HYBRID_STATUS_ENV } from "../../../hybrid-status.ts";
import { QUIET_WARNINGS_ENV } from "../../../quiet-warnings.ts";
import type {
	ChildCommand,
	ComposeContext,
	LintCliOptions,
	OxlintComposeContext,
	ToolLabel,
	WorkerDemand,
} from "../cli/types.ts";
import {
	FAST_WORKER_MEMORY_MB,
	OXLINT_THREAD_MEMORY_MB,
	programSize,
	programWorkerMemoryMb,
} from "./concurrency.ts";

/**
 * The pass each ESLint child's cost is learned under. The full config and the
 * fix child share one: both lint with every rule. A child that builds a
 * TypeScript program adds its size (see `programSize`).
 */
const ESLINT_COST_PASS: Partial<Record<ToolLabel, string>> = {
	eslint: "eslint-full",
	fast: "eslint-fast",
	typed: "eslint-typed",
};

const ESLINT_CONCURRENCY_FLAG = /^--concurrency(?:=|$)/;

/**
 * Compose the oxlint child command.
 *
 * @param options - The parsed CLI options.
 * @param context - The resolved composition context.
 * @returns The oxlint child command.
 */
export function composeOxlintCommand(
	options: LintCliOptions,
	context: OxlintComposeContext,
): ChildCommand {
	// The planned count is in the arguments, so a child that runs without a
	// lease (the budget failed) still gets it; a granted lease rewrites it.
	const args = context.threads === undefined ? [] : ["--threads", String(context.threads)];
	if (options.agents) {
		args.push("--format", "agent");
	}

	if (context.oxlintTypeAware) {
		args.push("--type-aware");
	}

	if (options.fix) {
		args.push("--fix");
	}

	// Every target surviving `oxlintTargets` can still resolve to nothing once
	// oxlint applies its own config `ignores` — a hook staging a tracked but
	// config-ignored file (`src/generated/*.ts`, say) is the common case, and no
	// git-side prediction can see those patterns. Bare, oxlint exits non-zero
	// there and fails the hook over a file it was never going to lint. A path
	// that matches nothing at all still surfaces: the ESLint pass reports it.
	args.push(
		"--no-error-on-unmatched-pattern",
		...options.oxlintArgs,
		...pathArguments(context.paths),
	);
	const command: ChildCommand = { args, bin: "oxlint", env: {}, label: "oxc", watchHeap: false };
	if (context.threads !== undefined) {
		// No cost is learned:
		// oxlint's memory does not grow with its threads (most of it is the
		// type-aware backend), so a peak divided by the threads would be
		// multiplied back by the thread count on the next lease.
		command.workers = {
			flag: "--threads",
			maxWorkers: context.threads,
			memoryPerWorkerMb: OXLINT_THREAD_MEMORY_MB,
			pass: undefined,
		};
	}

	return command;
}

/**
 * Compose the oxfmt child command. Oxfmt receives the files ESLint would lint
 * (see `FormatPlan`), so it formats the same files as the `oxfmt/oxfmt` rule
 * does in ESLint mode, and it still applies its config's `ignorePatterns` to
 * them. Only when the ESLint ignores cannot be resolved does it get the run's
 * own targets, `.` included. Like every engine child it is launched through the
 * bootstrap, so a long file list never reaches the OS command line.
 *
 * @param context - The child's settings.
 * @param context.configPath - The config module, passed as `--config` so oxfmt
 *   uses the file the lint factories read.
 * @param context.paths - The files to format; must not be empty, or oxfmt
 *   formats the whole tree.
 * @param context.write - Format the files in place rather than check them.
 * @returns The oxfmt child command.
 */
export function composeOxfmtCommand({
	configPath,
	paths,
	write,
}: {
	configPath: string;
	paths: Array<string>;
	write: boolean;
}): ChildCommand {
	// Oxfmt may not format every file it gets (Lua, say), or its config may
	// ignore one; neither is a failure.
	const args = [
		write ? "--write" : "--check",
		"--config",
		configPath,
		"--no-error-on-unmatched-pattern",
		...pathArguments(paths),
	];
	return { args, bin: "oxfmt", env: {}, label: "oxfmt", watchHeap: false };
}

/**
 * Compose the ESLint child command.
 *
 * @param options - The parsed CLI options.
 * @param context - The resolved composition context.
 * @returns The ESLint child command.
 */
export function composeEslintCommand(
	options: LintCliOptions,
	context: ComposeContext,
): ChildCommand {
	const args: Array<string> = [];
	if (options.cache) {
		args.push("--cache", "--cache-location", context.cacheLocation);
	}

	args.push("--no-warn-ignored", "--concurrency", String(context.concurrency));

	if (options.cache && context.ci) {
		args.push("--cache-strategy", "content");
	}

	if (options.agents) {
		args.push("--format", context.agentsFormatterPath);
	}

	if (context.fix) {
		args.push("--fix");
	}

	args.push(...options.eslintArgs, ...pathArguments(context.paths));

	// Always control ESLINT_TYPE_AWARE explicitly: set it for the fast/typed
	// passes, and set it to `undefined` for the full pass so an inherited value
	// (a user-exported ESLINT_TYPE_AWARE) is REMOVED rather than leaked — a leak
	// would make the factory split the full config (e.g. --fix applying only
	// type-aware fixes).
	const environment: Record<string, string | undefined> = {
		ESLINT_TYPE_AWARE: context.typeAwareEnv,
		// This child loads the config the run uses, so it may record its status.
		[HYBRID_STATUS_ENV]: "1",
	};

	if (context.quietWarnings === true) {
		environment[QUIET_WARNINGS_ENV] = "1";
	}

	// Set only to raise the heap of a pass that builds a TypeScript program;
	// otherwise the child inherits `NODE_OPTIONS` untouched.
	if (context.heap?.nodeOptions !== undefined) {
		environment["NODE_OPTIONS"] = context.heap.nodeOptions;
	}

	return {
		args,
		bin: "eslint",
		env: environment,
		...(context.heap?.capNote === undefined ? {} : { heapCapNote: context.heap.capNote }),
		label: context.eslintLabel,
		watchHeap: context.heap?.watch ?? false,
		// A `--concurrency` in `--eslint-args` comes after the planned one, so
		// ESLint runs with it and no grant could change it: lease nothing.
		...(options.eslintArgs.some((argument) => ESLINT_CONCURRENCY_FLAG.test(argument))
			? {}
			: { workers: eslintDemand(context) }),
	};
}

/**
 * The lint targets as the tail of an engine's argument list. A relative target
 * that starts with `-` would be read as a flag, so it is passed as `./<path>`.
 * A `--` separator is not enough: ESLint's bin scans the raw argv for
 * `--init`, `--mcp`, `--stdin` and `--debug` regardless of it, so a listed file
 * named `--init` would start the config wizard.
 *
 * @param paths - The lint targets.
 * @returns The arguments that pass them as paths.
 */
function pathArguments(paths: Array<string>): Array<string> {
	return paths.map((target) => (target.startsWith("-") ? `./${target}` : target));
}

/**
 * What an ESLint child asks the machine budget for: the planned concurrency as
 * its most workers (`off` is one, on the main thread), each counted at what a
 * worker of its kind is expected to use.
 *
 * A worker that builds a TypeScript program grows with its files, so its cost
 * is learned per size and its estimate counts its files. Both use the planned
 * workers: a smaller grant gives each worker more files than its lease counts.
 *
 * @param context - The resolved composition context.
 * @returns The child's worker demand.
 */
function eslintDemand(context: ComposeContext): WorkerDemand {
	const maxWorkers = context.concurrency === "off" ? 1 : context.concurrency;
	const pass = ESLINT_COST_PASS[context.eslintLabel] ?? `eslint-${context.eslintLabel}`;
	const filesPerWorker = Math.ceil(context.dirtyCount / maxWorkers);
	const buildsProgram = context.heap !== undefined;

	return {
		flag: "--concurrency",
		maxWorkers,
		memoryPerWorkerMb: buildsProgram
			? programWorkerMemoryMb(filesPerWorker)
			: FAST_WORKER_MEMORY_MB,
		pass: buildsProgram ? `${pass}:${programSize(filesPerWorker)}` : pass,
	};
}
