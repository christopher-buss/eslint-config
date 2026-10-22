import type {
	ChildCommand,
	ComposeContext,
	LintCliOptions,
	OxlintComposeContext,
} from "../cli/types.ts";

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
	const args: Array<string> = [];
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
	return { args, bin: "oxlint", env: {}, label: "oxc", watchHeap: false };
}

/**
 * Compose the oxfmt child command. Oxfmt receives the run's own targets and
 * applies its config's `ignorePatterns` to them, so a whole-tree run passes
 * `.` and lets oxfmt walk the tree itself. Like every engine child it is
 * launched through the bootstrap, so a long file list never reaches the OS
 * command line..
 *
 * @param options - The parsed CLI options.
 * @param context - The child's settings.
 * @param context.configPath - The config module, passed as `--config` so oxfmt
 *   uses the file the lint factories read.
 * @param context.write - Format the files in place rather than check them.
 * @returns The oxfmt child command.
 */
export function composeOxfmtCommand(
	options: LintCliOptions,
	{ configPath, write }: { configPath: string; write: boolean },
): ChildCommand {
	// A hook hands over every staged file, most of which oxfmt may not format
	// (Lua, say) or its config ignores; neither is a failure.
	const args = [
		write ? "--write" : "--check",
		"--config",
		configPath,
		"--no-error-on-unmatched-pattern",
		...pathArguments(options.paths),
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
	};

	// Set only to raise the heap of a pass that builds a TypeScript program;
	// otherwise the child inherits `NODE_OPTIONS` untouched.
	if (context.heap?.nodeOptions !== undefined) {
		environment["NODE_OPTIONS"] = context.heap.nodeOptions;
	}

	return {
		args,
		bin: "eslint",
		env: environment,
		label: context.eslintLabel,
		watchHeap: context.heap?.watch ?? false,
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
