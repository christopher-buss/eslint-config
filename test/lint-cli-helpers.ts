import { parseArguments } from "../src/lint-cli/lib/cli/options.ts";
import { resolveRunContext } from "../src/lint-cli/lib/context.ts";
import type { RunContext } from "../src/lint-cli/lib/context.ts";
import { compose, composePasses } from "../src/lint-cli/lib/plan/compose.ts";
import type { CommandPlan } from "../src/lint-cli/lib/plan/compose.ts";
import { plan } from "../src/lint-cli/lib/plan/plan.ts";
import type { StagedPlan } from "../src/lint-cli/lib/plan/plan.ts";
import type { PassPlan } from "../src/lint-cli/lib/plan/sizing.ts";
import { withoutGitEnvironment } from "./without-git.ts";

/** How a fixture run differs from the defaults. */
export interface ComposeInDirectoryOptions {
	/** The process environment the run sees. Defaults to empty. */
	environment?: NodeJS.ProcessEnv;
	/**
	 * Whether the run may mutate — spawn the builder, delete caches, write
	 * state. Defaults to false, which is what `--print` does.
	 */
	mutate?: boolean;
}

/**
 * Every pass a staged plan runs, in run order, resolving the deferred stage
 * (TypeScript builder and all) as the executor would. Staging is a spawn-timing
 * detail; a test asserting on what a run *does* wants the whole list.
 *
 * @param staged - The staged plan.
 * @returns The planned passes, eager stage first.
 */
export function allPasses(staged: StagedPlan): Array<PassPlan> {
	return [...staged.eager.passes, ...(staged.resolveDeferred?.() ?? [])];
}

/**
 * Describe a run against a fixture directory. Defaults match `--print`: an
 * empty environment and no mutation.
 *
 * @param directory - The fixture project root.
 * @param options - Environment and mutation overrides.
 * @returns The run context to hand to the module under test.
 */
export function runContext(
	directory: string,
	{ environment = {}, mutate = false }: ComposeInDirectoryOptions = {},
): RunContext {
	return resolveRunContext(directory, environment, mutate);
}

/**
 * Plan and compose a run against a fixture directory, the way the CLI does.
 *
 * The single place the lint-cli tests cross the plan/compose seam, so a change
 * to how a run is described lands here rather than at every call site. The git
 * worktree environment is cleared throughout, or `git ls-files` would resolve
 * against the repository the tests themselves live in instead of the fixture.
 *
 * @param argv - The CLI arguments (without the node/bin prefix).
 * @param directory - The fixture project root.
 * @param options - Environment and mutation overrides.
 * @returns The composed command plan.
 */
export function composeInDirectory(
	argv: Array<string>,
	directory: string,
	{ environment = {}, mutate = false }: ComposeInDirectoryOptions = {},
): CommandPlan {
	return withoutGitEnvironment(() => {
		const options = parseArguments(argv, environment);
		const staged = plan(options, runContext(directory, { environment, mutate }));
		const eager = compose(staged.eager, options);
		if (staged.resolveDeferred === undefined) {
			return eager;
		}

		// A staged run composes its type-aware pass separately, after the eager
		// children would have spawned. Tests assert on the whole run, so flatten
		// the two stages back into one plan the way the terminal sees them.
		const deferred = composePasses(staged.resolveDeferred(), staged.eager, options);
		return {
			commands: [...eager.commands, ...deferred.commands],
			notice: joinNotices(eager.notice, deferred.notice),
		};
	});
}

function joinNotices(...notices: Array<string | undefined>): string | undefined {
	const present = notices.filter((notice) => notice !== undefined);
	return present.length > 0 ? present.join("") : undefined;
}
