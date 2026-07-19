import type { ESLint, Linter } from "eslint";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

import eslintFormatterAgents from "../src/formatter-agents.ts";

const ROOT = process.cwd();

/** Convenience shape for authoring lint messages in fixtures. */
type MessageInput = Partial<Linter.LintMessage> & Pick<Linter.LintMessage, "message" | "severity">;

/**
 * Build a fully typed {@link ESLint.LintResult} from a handful of messages,
 * computing the summary counts the way ESLint does.
 *
 * @param fileName - File name placed under {@link ROOT}.
 * @param messages - The lint messages for the file.
 * @param suppressedMessages - Messages suppressed by inline directives.
 * @returns A lint result suitable for feeding to the formatter.
 */
function makeResult(
	fileName: string,
	messages: ReadonlyArray<MessageInput>,
	suppressedMessages: ReadonlyArray<MessageInput> = [],
): ESLint.LintResult {
	const fullMessages = messages.map<Linter.LintMessage>((message) => {
		return {
			column: 1,
			line: 1,
			ruleId: null,
			...message,
		};
	});

	const errorCount = fullMessages.filter((message) => message.severity === 2).length;

	return {
		errorCount,
		fatalErrorCount: fullMessages.filter((message) => message.fatal === true).length,
		filePath: path.join(ROOT, fileName),
		fixableErrorCount: 0,
		fixableWarningCount: 0,
		messages: fullMessages,
		suppressedMessages: suppressedMessages.map<Linter.SuppressedLintMessage>((message) => {
			return {
				column: 1,
				line: 1,
				ruleId: null,
				suppressions: [{ justification: "", kind: "directive" }],
				...message,
			};
		}),
		usedDeprecatedRules: [],
		warningCount: fullMessages.length - errorCount,
	};
}

/** Run metadata that relativizes file paths against {@link ROOT}. */
const DATA: ESLint.LintResultData = { cwd: ROOT, rulesMeta: {} };

describe("eslintFormatterAgents", () => {
	it("returns an empty string when nothing was reported", () => {
		expect.hasAssertions();
		expect(eslintFormatterAgents([makeResult("clean.ts", [])], DATA)).toBe("");
	});

	it("returns an empty string for empty result lists", () => {
		expect.hasAssertions();
		expect(eslintFormatterAgents([], DATA)).toBe("");
	});

	it("formats errors and warnings sorted by position within a file", () => {
		expect.hasAssertions();

		const output = eslintFormatterAgents(
			[
				makeResult("foo.ts", [
					{
						column: 5,
						line: 3,
						message: "Unexpected any.",
						ruleId: "ts/no-explicit-any",
						severity: 2,
					},
					{
						column: 10,
						line: 1,
						message: "Do not use null.",
						ruleId: "unicorn/no-null",
						severity: 1,
					},
				]),
			],
			DATA,
		);

		expect(output).toMatchInlineSnapshot(`
			"foo.ts:1:10: warning unicorn/no-null: Do not use null.
			foo.ts:3:5: error ts/no-explicit-any: Unexpected any.
			"
		`);
	});

	it("labels fatal parse errors as errors under the eslint rule id", () => {
		expect.hasAssertions();

		const output = eslintFormatterAgents(
			[
				makeResult("bad.ts", [
					{
						column: 1,
						fatal: true,
						line: 2,
						message: "Parsing error: Unexpected token",
						ruleId: null,
						severity: 2,
					},
				]),
			],
			DATA,
		);

		expect(output).toMatchInlineSnapshot(`
			"bad.ts:2:1: error eslint: Parsing error: Unexpected token
			"
		`);
	});

	it("sorts messages across multiple files by relative path", () => {
		expect.hasAssertions();

		const output = eslintFormatterAgents(
			[
				makeResult("b.ts", [
					{ column: 1, line: 1, message: "Warn B.", ruleId: "y/warn", severity: 1 },
				]),
				makeResult("a.ts", [
					{ column: 1, line: 1, message: "Error A.", ruleId: "x/error", severity: 2 },
				]),
			],
			DATA,
		);

		expect(output).toMatchInlineSnapshot(`
			"a.ts:1:1: error x/error: Error A.
			b.ts:1:1: warning y/warn: Warn B.
			"
		`);
	});

	it("breaks position ties by severity then rule id", () => {
		expect.hasAssertions();

		const output = eslintFormatterAgents(
			[
				makeResult("tie.ts", [
					{ column: 1, line: 1, message: "Warn.", ruleId: "a/warn", severity: 1 },
					{ column: 1, line: 1, message: "Error Z.", ruleId: "z/error", severity: 2 },
					{ column: 1, line: 1, message: "Error A.", ruleId: "a/error", severity: 2 },
				]),
			],
			DATA,
		);

		expect(output).toMatchInlineSnapshot(`
			"tie.ts:1:1: error a/error: Error A.
			tie.ts:1:1: error z/error: Error Z.
			tie.ts:1:1: warning a/warn: Warn.
			"
		`);
	});

	it("collapses message whitespace onto a single line", () => {
		expect.hasAssertions();

		const output = eslintFormatterAgents(
			[
				makeResult("multiline.ts", [
					{
						column: 2,
						line: 4,
						message: "Line one\n   Line two\t\tend  ",
						ruleId: "sonar/msg",
						severity: 2,
					},
				]),
			],
			DATA,
		);

		expect(output).toMatchInlineSnapshot(`
			"multiline.ts:4:2: error sonar/msg: Line one Line two end
			"
		`);
	});

	it("ignores suppressed messages and fixable counts", () => {
		expect.hasAssertions();

		const result = makeResult(
			"suppressed.ts",
			[],
			[{ column: 1, line: 1, message: "Suppressed.", ruleId: "x/rule", severity: 2 }],
		);

		expect(eslintFormatterAgents([{ ...result, fixableErrorCount: 5 }], DATA)).toBe("");
	});

	it("relativizes against process.cwd() when no run data is provided", () => {
		expect.hasAssertions();

		const output = eslintFormatterAgents([
			makeResult("fallback.ts", [
				{ column: 3, line: 7, message: "Nope.", ruleId: "n/rule", severity: 2 },
			]),
		]);

		expect(output).toMatchInlineSnapshot(`
			"fallback.ts:7:3: error n/rule: Nope.
			"
		`);
	});
});
