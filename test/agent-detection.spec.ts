import process from "node:process";
import { describe, expect, it } from "vitest";

import { isInAgentSession } from "../src/utils.ts";

/**
 * Run `run` with `process.stdout.isTTY` forced, which the kiro probe consults
 * to tell an interactive terminal apart from the agent.
 *
 * @template T - The callback's return type.
 * @param isTty - The value to report while running.
 * @param run - The callback to run.
 * @returns The callback's result.
 */
function withTty<T>(isTty: boolean, run: () => T): T {
	const original = process.stdout.isTTY;
	process.stdout.isTTY = isTty;

	try {
		return run();
	} finally {
		process.stdout.isTTY = original;
	}
}

describe("isInAgentSession", () => {
	it("returns false for a bare environment", () => {
		expect.hasAssertions();

		expect(isInAgentSession({})).toBe(false);
	});

	it("honours the AI_AGENT override", () => {
		expect.hasAssertions();

		expect(isInAgentSession({ AI_AGENT: "junie" })).toBe(true);
		expect(isInAgentSession({ AI_AGENT: "" })).toBe(false);
	});

	it("detects the plain marker variables", () => {
		expect.hasAssertions();

		for (const name of [
			"CLAUDECODE",
			"CLAUDE_CODE",
			"CLAUDE_CODE_ENTRYPOINT",
			"REPL_ID",
			"GEMINI_CLI",
			"CODEX_SANDBOX",
			"CODEX_THREAD_ID",
			"OPENCODE",
			"AUGMENT_AGENT",
			"GOOSE_PROVIDER",
			"JUNIE_DATA",
			"JUNIE_SHIM_PATH",
			"CURSOR_AGENT",
		]) {
			expect(isInAgentSession({ [name]: "1" })).toBe(true);
		}
	});

	it("matches pi through PATH and devin through EDITOR", () => {
		expect.hasAssertions();

		expect(isInAgentSession({ PATH: "/usr/bin:/home/u/.pi/agent/bin" })).toBe(true);
		expect(isInAgentSession({ PATH: String.raw`C:\Users\u\.pi\agent\bin` })).toBe(true);
		expect(isInAgentSession({ PATH: "/usr/bin" })).toBe(false);
		expect(isInAgentSession({ EDITOR: "devin" })).toBe(true);
		expect(isInAgentSession({ EDITOR: "vim" })).toBe(false);
	});

	it("matches kiro only when stdout is not a TTY", () => {
		expect.hasAssertions();

		expect(withTty(false, () => isInAgentSession({ TERM_PROGRAM: "kiro" }))).toBe(true);
		expect(withTty(true, () => isInAgentSession({ TERM_PROGRAM: "kiro" }))).toBe(false);
	});

	it("declines inside git hooks and lint-staged", () => {
		expect.hasAssertions();

		expect(isInAgentSession({ CLAUDECODE: "1", GIT_HOOK: "1" })).toBe(false);
		expect(isInAgentSession({ AI_AGENT: "claude", npm_lifecycle_script: "lint-staged" })).toBe(
			false,
		);
	});
});
