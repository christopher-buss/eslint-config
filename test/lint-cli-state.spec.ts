import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	readFileIfPresent,
	readState,
	STATE_VERSION,
	stateDirectory,
	statePath,
	swapState,
	touchState,
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
	it("hyphen-joins its parts inside the cache directory", () => {
		expect.hasAssertions();

		expect(statePath("/project", "ignored", "aaaa1111")).not.toBe(
			statePath("/project", "ignored", "bbbb2222"),
		);
		expect(path.dirname(statePath("/project", "ignored", "aaaa1111"))).toBe(
			stateDirectory("/project"),
		);
		expect(path.basename(statePath("/project", "tsbuildinfo", "full", "key", "id"))).toBe(
			"tsbuildinfo-full-key-id",
		);
	});
});

describe("readState", () => {
	it("round-trips a payload through a directory it creates", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const file = statePath(directory, "example", "key");
			writeState(file, { hash: "abc" });

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
	it("leaves no temp file behind when the write fails", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			// The cache home as a file makes creating the state directory throw.
			fs.mkdirSync(path.join(directory, "node_modules"));
			fs.writeFileSync(path.join(directory, "node_modules", ".cache"), "");

			expect(() => {
				writeState(statePath(directory, "example"), "payload");
			}).not.toThrow();
			expect(fs.readdirSync(directory)).toStrictEqual(["node_modules"]);
		});
	});
});

describe("swapState", () => {
	it("reports changed for state it cannot read back", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const file = statePath(directory, "example", "key");
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, JSON.stringify({ data: "one", version: STATE_VERSION + 1 }));

			// A CLI upgrade must invalidate what it finds, not adopt it: the
			// caches keyed to an unreadable hash cannot be vouched for, so the
			// caller has to bust rather than treat this as a first run.
			expect(swapState(file, "one")).toBe("changed");
			expect(swapState(file, "one")).toBe("unchanged");
		});
	});

	it("reports first, unchanged and changed across successive runs", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const file = statePath(directory, "example", "key");

			expect(swapState(file, "one")).toBe("first");
			expect(swapState(file, "one")).toBe("unchanged");
			expect(swapState(file, "two")).toBe("changed");
			// The swap consumes the value, which is why hash state is keyed per
			// config variant: a second run never sees the same change again.
			expect(swapState(file, "two")).toBe("unchanged");
		});
	});
});

describe("touchState", () => {
	it("refreshes an existing mtime and ignores a missing file", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const file = statePath(directory, "example");
			writeState(file, { oxlint: true });
			const past = Date.now() / 1000 - 60;
			fs.utimesSync(file, past, past);
			const before = fs.statSync(file).mtimeMs;
			const content = readFileIfPresent(file);

			touchState(file);

			expect(fs.statSync(file).mtimeMs).toBeGreaterThan(before);
			expect(readFileIfPresent(file)).toBe(content);
			expect(() => {
				touchState(statePath(directory, "absent"));
			}).not.toThrow();
		});
	});
});

describe("readFileIfPresent", () => {
	it("returns undefined instead of throwing for an unreadable file", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(readFileIfPresent(path.join(directory, "absent"))).toBeUndefined();
			// A directory is readable as a path but not as a file.
			expect(readFileIfPresent(directory)).toBeUndefined();
		});
	});
});
