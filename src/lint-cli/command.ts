import type {
	ChildCommand,
	ComposeContext,
	LintCliOptions,
	OxlintComposeContext,
} from "./types.ts";

const SAFE_TOKEN = /^[\w@%+=:,./-]+$/;

/**
 * Split a raw argument string into tokens, honouring single and double quotes
 * so values such as `--rule "no-console: error"` survive as one argument.
 *
 * @param input - The raw argument string to split.
 * @returns The parsed argument tokens.
 */
export function splitArgs(input: string): Array<string> {
	const tokens: Array<string> = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let hasToken = false;

	for (const char of input) {
		if (quote !== undefined) {
			if (char === quote) {
				quote = undefined;
			} else {
				current += char;
			}

			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			hasToken = true;
			continue;
		}

		if (char === " " || char === "\t" || char === "\n") {
			if (hasToken) {
				tokens.push(current);
				current = "";
				hasToken = false;
			}

			continue;
		}

		current += char;
		hasToken = true;
	}

	if (hasToken) {
		tokens.push(current);
	}

	return tokens;
}

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

	const environment: Record<string, string> =
		context.typeAwareEnv !== undefined ? { ESLINT_TYPE_AWARE: context.typeAwareEnv } : {};

	return { args, bin: "eslint", env: environment, label: context.eslintLabel };
}

/**
 * Render a command as a shell-equivalent line (env prefix + logical binary +
 * arguments) for `--print`. Uses POSIX quoting for stable, cross-platform
 * output.
 *
 * @param command - The child command to render.
 * @returns The shell-equivalent command line.
 */
export function formatCommandLine(command: ChildCommand): string {
	const environmentPrefix = Object.entries(command.env)
		.map(([key, value]) => `${key}=${quotePosix(value)}`)
		.join(" ");
	const body = [command.bin, ...command.args].map(quotePosix).join(" ");
	return environmentPrefix.length > 0 ? `${environmentPrefix} ${body}` : body;
}

/**
 * Build the command string concurrently runs through a shell. The tool is
 * launched via `node <binJs>` so no `.cmd`/`.ps1` shim quoting is involved.
 *
 * @param nodePath - Absolute path to the Node executable.
 * @param binJsPath - Absolute path to the tool's JavaScript entry.
 * @param args - The tool arguments.
 * @param platform - The platform whose shell quoting rules to apply.
 * @returns The shell command string.
 */
export function buildShellCommand(
	nodePath: string,
	binJsPath: string,
	args: Array<string>,
	platform: NodeJS.Platform,
): string {
	const quote = platform === "win32" ? quoteWindows : quotePosix;
	return [nodePath, binJsPath, ...args].map(quote).join(" ");
}

function quotePosix(token: string): string {
	if (token.length > 0 && SAFE_TOKEN.test(token)) {
		return token;
	}

	return `'${token.replaceAll("'", "'\\''")}'`;
}

function quoteWindows(token: string): string {
	if (token.length > 0 && SAFE_TOKEN.test(token)) {
		return token;
	}

	return `"${token.replaceAll('"', '\\"')}"`;
}
