import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	readState,
	STATE_VERSION,
	stateDirectory,
	statePath,
	writeState,
} from "../src/lint-cli/state.ts";

function withTemporaryDirectory(run: (directory: string) => void): void {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-state-"));

	try {
		run(directory);
	} finally {
		fs.rmSync(directory, { force: true, recursive: true });
	}
}

describe("statePath", () => {
	it("keys a name apart per variant, inside the cache directory", () => {
		expect.hasAssertions();

		expect(statePath("/project", "ignored", "aaaa1111")).not.toBe(
			statePath("/project", "ignored", "bbbb2222"),
		);
		expect(path.dirname(statePath("/project", "ignored", "aaaa1111"))).toBe(
			stateDirectory("/project"),
		);
		expect(path.basename(statePath("/project", "hybrid-status"))).toBe("hybrid-status");
	});
});

describe("readState", () => {
	it("round-trips a payload through a directory it creates", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const file = statePath(directory, "example", "key");

			expect(writeState(file, { hash: "abc" })).toBe(true);
			expect(readState<{ hash: string }>(file)).toStrictEqual({ hash: "abc" });
		});
	});

	it("returns undefined when the file is missing or malformed", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const file = statePath(directory, "example");

			expect(readState(file)).toBeUndefined();

			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, "not json");

			expect(readState(file)).toBeUndefined();
		});
	});

	it("rejects state written by another schema version", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const file = statePath(directory, "example");
			writeState(file, "payload");
			fs.writeFileSync(file, JSON.stringify({ data: "payload", version: STATE_VERSION + 1 }));

			// A CLI upgrade that changes a stored shape must invalidate the old
			// file rather than misread it: the config hash only says the config
			// is unchanged, so nothing else catches this.
			expect(readState(file)).toBeUndefined();
		});
	});
});

describe("writeState", () => {
	it("refreshes the mtime instead of rewriting identical content", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const file = statePath(directory, "example");
			writeState(file, { oxlint: true });
			const past = Date.now() / 1000 - 60;
			fs.utimesSync(file, past, past);
			const before = fs.statSync(file).mtimeMs;

			expect(writeState(file, { oxlint: true })).toBe(true);
			expect(fs.statSync(file).mtimeMs).toBeGreaterThan(before);
		});
	});

	it("leaves no temp file behind and reports a failed write", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			// The cache home as a file makes creating the state directory throw.
			fs.mkdirSync(path.join(directory, "node_modules"));
			fs.writeFileSync(path.join(directory, "node_modules", ".cache"), "");

			expect(writeState(statePath(directory, "example"), "payload")).toBe(false);
			expect(fs.existsSync(stateDirectory(directory))).toBe(false);
		});
	});
});
