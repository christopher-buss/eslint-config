import type { ChildCommand, LintCliOptions } from "../cli/types.ts";
import { composeEslintCommand, composeOxlintCommand } from "./command.ts";
import type { RunPlan } from "./plan.ts";

/** The stderr notice emitted when a lint target resolves outside the cwd. */
const OUTSIDE_CWD_NOTICE =
	"isentinel-lint: a lint target resolves outside the working directory; sizing " +
	"conservatively and not auto-skipping the type-aware pass.\n";

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
