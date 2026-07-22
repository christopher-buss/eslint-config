import { compose } from "../src/lint-cli/compose.ts";
import type { CommandPlan } from "../src/lint-cli/compose.ts";
import { resolveRunContext } from "../src/lint-cli/context.ts";
import type { RunContext } from "../src/lint-cli/context.ts";
import { parseArguments } from "../src/lint-cli/options.ts";
import { plan } from "../src/lint-cli/plan.ts";
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
		return compose(plan(options, runContext(directory, { environment, mutate })), options);
	});
}
