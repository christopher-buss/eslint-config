import { isPackageExists } from "local-pkg";
import process from "node:process";

import { parseArguments } from "./cli/options.ts";
import type { ChildCommand, LintCliOptions } from "./cli/types.ts";
import { CliError } from "./cli/types.ts";
import { resolveRunContext } from "./context.ts";
import { execute, executeStaged } from "./exec/execute.ts";
import { formatCommandLine } from "./exec/shell.ts";
import { compose, composePasses } from "./plan/compose.ts";
import { plan } from "./plan/plan.ts";
import type { StagedPlan } from "./plan/plan.ts";
import type { PassPlan } from "./plan/sizing.ts";

/** A finished check stage: its exit code and the passes it planned. */
interface CheckOutcome {
	/** The aggregated exit code of the check children. */
	code: number;
	/**
	 * Every pass the run planned, auto-skipped ones included. A skipped pass
	 * still owns a cache whose verdict stands, which is what narrows a fix run
	 * (see `collectFixTargets`).
	 */
	passes: Array<PassPlan>;
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
	const staged = plan(options, run);
	const { commands, notice } = compose(staged.eager, options);

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

	const { resolveFixChild } = staged;
	if (resolveFixChild === undefined) {
		const checkOnly = await runChecks(commands, cwd, staged, options);
		return checkOnly.code;
	}

	// oxlint writes the files the ESLint checks read, so it goes first and
	// alone; the checks then lint what it left behind, exactly as they would in
	// a check run.
	const byBin = Object.groupBy(commands, (command) => command.bin);
	const oxlintCode = await execute(byBin.oxlint ?? [], cwd, true);
	const checks = await runChecks(byBin.eslint ?? [], cwd, staged, options);

	const fixChild = resolveFixChild(checks.passes);
	if (fixChild === undefined) {
		return oxlintCode || checks.code;
	}

	// The fix child re-lints every file the checks reported, under a config that
	// is a superset of theirs, so what it reports is what survives fixing. Its
	// code replaces theirs rather than joining it, or a run that fixed
	// everything it found would still fail. The one thing that hides is a check
	// child that died fatally while its sibling still reported files — rare, and
	// the fix child runs the same type-aware rules, so it dies too.
	return oxlintCode || (await execute([fixChild], cwd, true));
}

/**
 * Run a run's ESLint check children and report which passes they covered.
 *
 * A staged run is concurrent by construction (the planner only stages when at
 * least one other child is already linting). Its type-aware pass is planned —
 * TypeScript builder and all — only once the children above are running, and
 * its notice is emitted as soon as it is known rather than held to the end of
 * the run.
 *
 * @param commands - The composed check children.
 * @param cwd - The working directory.
 * @param staged - The staged plan the commands came from.
 * @param options - The parsed CLI options.
 * @returns The aggregated exit code and every pass that was planned.
 */
async function runChecks(
	commands: Array<ChildCommand>,
	cwd: string,
	staged: StagedPlan,
	options: LintCliOptions,
): Promise<CheckOutcome> {
	const passes = [...staged.eager.passes];
	const { resolveDeferred } = staged;
	if (resolveDeferred === undefined) {
		return { code: await execute(commands, cwd, commands.length <= 1), passes };
	}

	const code = await executeStaged(commands, cwd, () => {
		const deferred = resolveDeferred();
		passes.push(...deferred);

		const later = composePasses(deferred, staged.eager, options);
		if (later.notice !== undefined) {
			process.stderr.write(later.notice);
		}

		return later.commands;
	});

	return { code, passes };
}
