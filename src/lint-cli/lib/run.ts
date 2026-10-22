import { isPackageExists } from "local-pkg";
import process from "node:process";

import { findOxfmtConfig } from "../../utils.ts";
import { readFileList } from "./cli/file-list.ts";
import { parseArguments } from "./cli/options.ts";
import type { ChildCommand, LintCliOptions } from "./cli/types.ts";
import { CliError } from "./cli/types.ts";
import { resolveRunContext } from "./context.ts";
import { execute, executeStaged, resetCancellation } from "./exec/execute.ts";
import { formatCommandLine } from "./exec/shell.ts";
import { composeOxfmtCommand } from "./plan/command.ts";
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
 * @param stdin - Where `--files0-from -` reads its list (defaults to
 *   `process.stdin`).
 * @returns The process exit code.
 * @rejects {CliError} When the arguments are invalid or a tool is missing.
 */
export async function runLint(
	argv: Array<string>,
	cwd: string = process.cwd(),
	environment: NodeJS.ProcessEnv = process.env,
	stdin: AsyncIterable<unknown> = process.stdin,
): Promise<number> {
	resetCancellation();

	// Resolved once, before anything is planned: from here on the list is
	// just the run's paths.
	const options = await readFileList(parseArguments(argv, environment), cwd, stdin);

	// An explicitly empty list selects nothing. It is not the absence of
	// paths, so it must not fall back to linting the whole tree.
	if (options.paths.length === 0) {
		return 0;
	}

	const run = resolveRunContext(cwd, environment, !options.print);
	const staged = plan(options, run);
	const { commands, notice } = compose(staged.eager, options);
	const oxfmtConfig = findOxfmtModule(options, cwd);
	const formatCommand =
		oxfmtConfig === undefined
			? undefined
			: composeOxfmtCommand(options, { configPath: oxfmtConfig, write: options.fix });
	if (options.print) {
		const printed = formatCommand === undefined ? commands : [...commands, formatCommand];
		for (const command of printed) {
			process.stdout.write(`${formatCommandLine(command)}\n`);
		}

		// The workers and heap each program-building pass was given. On stderr,
		// so a captured command list stays exactly the commands.
		for (const pass of staged.eager.passes) {
			if (pass.shouldRun && pass.heap !== undefined) {
				process.stderr.write(pass.heap.note);
			}
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

	if (formatCommand !== undefined && !isPackageExists("oxfmt", { paths: [cwd] })) {
		throw new CliError(
			"oxfmt is not installed, but this project has an `oxfmt.config.*` file. " +
				"Install oxfmt, or pass --no-oxfmt to skip formatting.",
		);
	}

	if (notice !== undefined) {
		process.stderr.write(notice);
	}

	const { resolveFixChild } = staged;
	if (resolveFixChild === undefined) {
		// The format check reads files nothing else writes, so it runs
		// alongside the lint checks. A fix run writes instead, after the lint
		// fixes (below).
		const checkCommands = formatCommand === undefined ? commands : [...commands, formatCommand];
		const checkOnly = await runChecks(checkCommands, cwd, staged, options);
		return checkOnly.code;
	}

	// oxlint writes the files the ESLint checks read, so it goes first and
	// alone; the checks then lint what it left behind, exactly as they would in
	// a check run.
	const byBin = Object.groupBy(commands, (command) => command.bin);
	const oxlintCode = await execute(byBin.oxlint ?? [], cwd, true);
	const checks = await runChecks(byBin.eslint ?? [], cwd, staged, options);

	const fixChild = resolveFixChild(checks.passes);
	// The fix child re-lints every file the checks reported, under a config that
	// is a superset of theirs, so what it reports is what survives fixing. Its
	// code replaces theirs rather than joining it, or a run that fixed
	// everything it found would still fail. The one thing that hides is a check
	// child that died fatally while its sibling still reported files — rare, and
	// the fix child runs the same type-aware rules, so it dies too.
	const lintCode =
		fixChild === undefined
			? oxlintCode || checks.code
			: oxlintCode || (await execute([fixChild], cwd, true));

	// Formatting goes last, so it settles whatever the lint fixes wrote.
	if (formatCommand === undefined) {
		return lintCode;
	}

	const formatCode = await execute([formatCommand], cwd, true);
	return lintCode || formatCode;
}

/**
 * The oxfmt config module the run formats with. The oxfmt pass is on when the
 * project runs oxfmt as its own tool (an `oxfmt.config.ts` or
 * `oxfmt.config.mts`, found the way oxfmt finds it), unless `--no-oxfmt` or a
 * single-engine flag (`--eslint`, `--oxlint`) says otherwise.
 *
 * @param options - The parsed CLI options.
 * @param cwd - The working directory.
 * @returns The config module path, or `undefined` to skip the pass.
 * @throws {CliError} When one directory holds more than one oxfmt config.
 */
function findOxfmtModule(options: LintCliOptions, cwd: string): string | undefined {
	if (!options.oxfmt || options.eslint || options.oxlint) {
		return undefined;
	}

	let config: ReturnType<typeof findOxfmtConfig>;
	try {
		config = findOxfmtConfig(cwd);
	} catch (err) {
		throw new CliError(err instanceof Error ? err.message : String(err));
	}

	return config?.isModule === true ? config.path : undefined;
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
