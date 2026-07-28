import { isPackageExists } from "local-pkg";
import process from "node:process";

import { parseArguments } from "./cli/options.ts";
import { CliError } from "./cli/types.ts";
import { resolveRunContext } from "./context.ts";
import { execute, executeStaged } from "./exec/execute.ts";
import { formatCommandLine } from "./exec/shell.ts";
import { compose, composePasses } from "./plan/compose.ts";
import { plan } from "./plan/plan.ts";

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

	const { resolveDeferred } = staged;
	if (resolveDeferred === undefined) {
		// `--fix` must be sequential: two children writing the same files at once
		// would race. A lone child gains nothing from the concurrently harness.
		return execute(commands, cwd, options.fix || commands.length <= 1);
	}

	// A staged run is concurrent by construction (the planner only stages when
	// at least one other child is already linting), so it never takes the
	// sequential path. The type-aware pass is planned — TypeScript builder and
	// all — only once the children above are running, and its notice is emitted
	// as soon as it is known rather than held to the end of the run.
	return executeStaged(commands, cwd, () => {
		const later = composePasses(resolveDeferred(), staged.eager, options);
		if (later.notice !== undefined) {
			process.stderr.write(later.notice);
		}

		return later.commands;
	});
}
