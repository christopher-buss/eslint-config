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

	args.push(...options.oxlintArgs, ...context.paths);
	return { args, bin: "oxlint", env: {}, label: "oxc" };
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

	if (options.fix) {
		args.push("--fix");
	}

	args.push(...options.eslintArgs, ...context.paths);

	// Always control ESLINT_TYPE_AWARE explicitly: set it for the fast/typed
	// passes, and set it to `undefined` for the full pass so an inherited value
	// (a user-exported ESLINT_TYPE_AWARE) is REMOVED rather than leaked — a leak
	// would make the factory split the full config (e.g. --fix applying only
	// type-aware fixes).
	const environment: Record<string, string | undefined> = {
		ESLINT_TYPE_AWARE: context.typeAwareEnv,
	};

	return { args, bin: "eslint", env: environment, label: context.eslintLabel };
}
