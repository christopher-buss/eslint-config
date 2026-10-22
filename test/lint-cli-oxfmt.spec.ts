import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { TestContext } from "vitest";
import { describe, it, vi } from "vitest";

import { isRecord, isStringArray } from "../src/guards.ts";
import { writeHybridStatus } from "../src/hybrid-status.ts";
import { parseArguments } from "../src/lint-cli/lib/cli/options.ts";
import { runLint } from "../src/lint-cli/lib/run.ts";
import { withoutGitEnvironment } from "./without-git.ts";

/** One engine child as a recording fake bin saw it. */
interface RecordedChild {
	argv: Array<string>;
	bin: string;
}

function writeFakeToolBin(directory: string, name: string, body: string): void {
	const packageDirectory = path.join(directory, "node_modules", name);
	fs.mkdirSync(packageDirectory, { recursive: true });
	fs.writeFileSync(
		path.join(packageDirectory, "package.json"),
		JSON.stringify({ name, bin: { [name]: "bin.js" }, version: "0.0.0" }),
	);
	fs.writeFileSync(path.join(packageDirectory, "bin.js"), body);
}

/**
 * A fake engine bin that appends its argv to a JSON-lines log.
 *
 * @param log - The log file.
 * @param name - The engine the bin stands in for.
 * @param exitCode - The code the bin exits with.
 * @returns The bin source.
 */
function recordingBin(log: string, name: string, exitCode = 0): string {
	return (
		'const fs=require("node:fs");' +
		`fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({` +
		`bin:${JSON.stringify(name)},argv:process.argv.slice(2)})+String.fromCharCode(10));` +
		`process.exitCode=${exitCode};`
	);
}

function readRecorded(log: string): Array<RecordedChild> {
	if (!fs.existsSync(log)) {
		return [];
	}

	return fs
		.readFileSync(log, "utf8")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => {
			const parsed: unknown = JSON.parse(line);
			if (
				!isRecord(parsed) ||
				typeof parsed["bin"] !== "string" ||
				!isStringArray(parsed["argv"])
			) {
				throw new TypeError(`unexpected log line: ${line}`);
			}

			return { argv: parsed["argv"], bin: parsed["bin"] };
		});
}

/**
 * A project with recording eslint, oxlint and oxfmt fakes.
 *
 * @param onTestFinished - Registers the cleanup.
 * @param options - What the fixture installs and writes.
 * @param options.config - Whether to write an `oxfmt.config.ts`.
 * @param options.oxfmt - Whether to install the oxfmt fake.
 * @param options.oxfmtExitCode - The code the oxfmt fake exits with.
 * @returns The fixture root and the recording log.
 */
function oxfmtFixture(
	onTestFinished: TestContext["onTestFinished"],
	{ config = true, oxfmt = true, oxfmtExitCode = 0 } = {},
): { directory: string; log: string } {
	const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-oxfmt-")));
	onTestFinished(() => {
		fs.rmSync(directory, { force: true, recursive: true });
	});

	const log = path.join(directory, "children.jsonl");
	writeFakeToolBin(directory, "eslint", recordingBin(log, "eslint"));
	writeFakeToolBin(directory, "oxlint", recordingBin(log, "oxlint"));
	if (oxfmt) {
		writeFakeToolBin(directory, "oxfmt", recordingBin(log, "oxfmt", oxfmtExitCode));
	}

	if (config) {
		fs.writeFileSync(path.join(directory, "oxfmt.config.ts"), "export default {};\n");
	}

	writeHybridStatus(directory, true);
	fs.writeFileSync(path.join(directory, "index.ts"), "export const value = 1;\n");
	return { directory, log };
}

describe("--oxfmt parsing", () => {
	it("defaults on and turns off with --no-oxfmt", ({ expect }) => {
		expect.assertions(2);

		expect(parseArguments([], {}).oxfmt).toBe(true);
		expect(parseArguments(["--no-oxfmt"], {}).oxfmt).toBe(false);
	});
});

describe("runLint oxfmt pass", () => {
	it("checks formatting alongside the linters", async ({ expect, onTestFinished }) => {
		expect.assertions(2);

		const { directory, log } = oxfmtFixture(onTestFinished);
		const code = await withoutGitEnvironment(async () => {
			return runLint(["--no-oxlint-type-aware"], directory, {});
		});

		expect(code).toBe(0);
		expect(readRecorded(log).filter((child) => child.bin === "oxfmt")).toStrictEqual([
			{
				argv: [
					"--check",
					"--config",
					path.join(directory, "oxfmt.config.ts"),
					"--no-error-on-unmatched-pattern",
					".",
				],
				bin: "oxfmt",
			},
		]);
	});

	it("fails the run when a file is not formatted", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const { directory } = oxfmtFixture(onTestFinished, { oxfmtExitCode: 1 });
		const code = await withoutGitEnvironment(async () => {
			return runLint(["--no-oxlint-type-aware"], directory, {});
		});

		expect(code).toBe(1);
	});

	it("writes last in a --fix run", async ({ expect, onTestFinished }) => {
		expect.assertions(2);

		const { directory, log } = oxfmtFixture(onTestFinished);
		const code = await withoutGitEnvironment(async () => {
			return runLint(["--fix", "--no-oxlint-type-aware"], directory, {});
		});

		expect(code).toBe(0);
		expect(readRecorded(log).at(-1)).toStrictEqual({
			argv: [
				"--write",
				"--config",
				path.join(directory, "oxfmt.config.ts"),
				"--no-error-on-unmatched-pattern",
				".",
			],
			bin: "oxfmt",
		});
	});

	it("fails a --fix run when oxfmt --write fails", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const { directory } = oxfmtFixture(onTestFinished, { oxfmtExitCode: 2 });
		const code = await withoutGitEnvironment(async () => {
			return runLint(["--fix", "--no-oxlint-type-aware"], directory, {});
		});

		expect(code).not.toBe(0);
	});

	it("prints the oxfmt command", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const { directory } = oxfmtFixture(onTestFinished);
		const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
		onTestFinished(() => {
			write.mockRestore();
		});
		await withoutGitEnvironment(async () => runLint(["--print"], directory, {}));
		const printed = write.mock.calls.map((call) => String(call[0])).join("");

		expect(printed).toContain("oxfmt --check --config");
	});

	it("skips oxfmt without a config, with --no-oxfmt, or for a single engine", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		const bare = oxfmtFixture(onTestFinished, { config: false });
		const disabled = oxfmtFixture(onTestFinished);
		const single = oxfmtFixture(onTestFinished);
		await withoutGitEnvironment(async () => {
			await runLint(["--no-oxlint-type-aware"], bare.directory, {});
			await runLint(["--no-oxlint-type-aware", "--no-oxfmt"], disabled.directory, {});
			await runLint(["--eslint"], single.directory, {});
		});

		const ranOxfmt = [bare, disabled, single].map(({ log }) => {
			return readRecorded(log).some((child) => child.bin === "oxfmt");
		});

		expect(ranOxfmt).toStrictEqual([false, false, false]);
	});

	it("errors clearly when oxfmt is not installed", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const { directory } = oxfmtFixture(onTestFinished, { oxfmt: false });

		await expect(
			withoutGitEnvironment(async () => runLint(["--no-oxlint-type-aware"], directory, {})),
		).rejects.toThrow(/oxfmt is not installed/);
	});
});
