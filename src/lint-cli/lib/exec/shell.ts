import type { ChildCommand } from "../cli/types.ts";

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

function quotePosix(token: string): string {
	if (token.length > 0 && SAFE_TOKEN.test(token)) {
		return token;
	}

	return `'${token.replaceAll("'", "'\\''")}'`;
}
