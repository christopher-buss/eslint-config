import type { ChildCommand } from "../cli/types.ts";
import { CliError } from "../cli/types.ts";

// `%` is deliberately excluded: cmd.exe expands `%VAR%` even inside double
// quotes, so a `%` token cannot be made safe by quoting on the Windows shell
// path (see `buildShellCommand`).
const SAFE_TOKEN = /^[\w@+=:,./-]+$/;

/**
 * Render a command as a shell-equivalent line (env prefix + logical binary +
 * arguments) for `--print`. Uses POSIX quoting for stable, cross-platform
 * output.
 *
 * @param command - The child command to render.
 * @returns The shell-equivalent command line.
 */
export function formatCommandLine(command: ChildCommand): string {
	// `undefined` values mean "unset this variable" (see ChildCommand.env); they
	// carry no shell-prefix representation, so they are omitted from the line.
	const environmentPrefix = Object.entries(command.env)
		.flatMap(([key, value]) => (value === undefined ? [] : [`${key}=${quotePosix(value)}`]))
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
	const tokens = [nodePath, binJsPath, ...args];
	if (platform === "win32") {
		// concurrently shells through cmd.exe, which expands `%VAR%` even inside
		// double quotes — no quoting can escape it, so refuse rather than
		// silently corrupt the argument.
		const offending = tokens.find((token) => token.includes("%"));
		if (offending !== undefined) {
			throw new CliError(
				`Cannot safely pass "${offending}" to cmd.exe: "%" triggers environment-` +
					"variable expansion even inside quotes. Remove it, or run the tool directly.",
			);
		}
	}

	const quote = platform === "win32" ? quoteWindows : quotePosix;
	return tokens.map(quote).join(" ");
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

	// Backslash runs are only special before a quote, so double them there and
	// before the closing quote — otherwise a token ending in `\` (for example the
	// Windows path `.\src\`) escapes that closing quote and merges with the next
	// argument.
	let escaped = "";
	let slashes = 0;
	for (const char of token) {
		if (char === "\\") {
			slashes += 1;
			escaped += char;
			continue;
		}

		escaped += char === '"' ? `${"\\".repeat(slashes)}\\"` : char;
		slashes = 0;
	}

	return `"${escaped}${"\\".repeat(slashes)}"`;
}
