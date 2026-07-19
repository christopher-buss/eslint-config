import type { ESLint } from "eslint";
import path from "node:path";
import process from "node:process";

type AgentSeverity = "error" | "warning";

interface AgentMessage {
	readonly column: number | undefined;
	readonly filePath: string;
	readonly line: number | undefined;
	readonly message: string;
	readonly ruleId: string;
	readonly severity: AgentSeverity;
}

function getSeverity(message: ESLint.LintResult["messages"][number]): AgentSeverity {
	return message.fatal === true || message.severity === 2 ? "error" : "warning";
}

function getRuleId(message: ESLint.LintResult["messages"][number]): string {
	return message.ruleId ?? "eslint";
}

function getRelativeFilePath(
	filePath: string,
	lintResultData: ESLint.LintResultData | undefined,
): string {
	const currentWorkingDirectory = lintResultData?.cwd ?? process.cwd();
	const relativeFilePath = path.relative(currentWorkingDirectory, filePath);

	return relativeFilePath.length === 0 ? filePath : relativeFilePath;
}

function compareNumbers(first = 0, second = 0): number {
	return first - second;
}

function compareMessages(first: AgentMessage, second: AgentMessage): number {
	const fileComparison = first.filePath.localeCompare(second.filePath);
	if (fileComparison !== 0) {
		return fileComparison;
	}

	const lineComparison = compareNumbers(first.line, second.line);
	if (lineComparison !== 0) {
		return lineComparison;
	}

	const columnComparison = compareNumbers(first.column, second.column);
	if (columnComparison !== 0) {
		return columnComparison;
	}

	if (first.severity !== second.severity) {
		return first.severity === "error" ? -1 : 1;
	}

	return first.ruleId.localeCompare(second.ruleId);
}

const WHITESPACE_REGEXP = /\s+/gu;
/**
 * ESLint custom formatter that prints one lint message per line in a stable,
 * agent-friendly shape.
 *
 * Each line reads `path:line:column: severity ruleId: message`, with message
 * whitespace collapsed to single spaces so a diagnostic never wraps across
 * lines. Output is sorted deterministically (file, line, column, severity,
 * ruleId) so identical lint runs produce byte-identical output, and returns an
 * empty string when there are no messages.
 *
 * @param lintResults - The per-file lint results ESLint passes to the
 *   formatter.
 * @param lintResultData - Optional run metadata; `cwd` is used to relativize
 *   file paths, falling back to `process.cwd()`.
 * @returns The formatted report, terminated by a trailing newline, or an empty
 *   string when nothing was reported.
 */
export default function eslintFormatterAgents(
	lintResults: ReadonlyArray<ESLint.LintResult>,
	lintResultData?: ESLint.LintResultData,
): string {
	const messages = new Array<AgentMessage>();

	for (const lintResult of lintResults) {
		const filePath = getRelativeFilePath(lintResult.filePath, lintResultData);

		for (const message of lintResult.messages) {
			messages.push({
				column: message.column,
				filePath,
				line: message.line,
				message: normalizeMessage(message.message),
				ruleId: getRuleId(message),
				severity: getSeverity(message),
			});
		}
	}

	if (messages.length === 0) {
		return "";
	}

	return `${messages.toSorted(compareMessages).map(formatMessage).join("\n")}\n`;
}

function normalizeMessage(message: string): string {
	return message.replaceAll(WHITESPACE_REGEXP, " ").trim();
}

function formatMessage({
	column,
	filePath,
	line,
	message,
	ruleId,
	severity,
}: AgentMessage): string {
	const location = line === undefined ? filePath : `${filePath}:${line}:${column ?? 0}`;
	return `${location}: ${severity} ${ruleId}: ${message}`;
}
