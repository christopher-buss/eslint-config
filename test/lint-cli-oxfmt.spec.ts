// cspell:words lintable rbxm tfstate jakefile
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { TestContext } from "vitest";
import { describe, it, vi } from "vitest";

import { isRecord, isStringArray } from "../src/guards.ts";
import { writeHybridStatus } from "../src/hybrid-status.ts";
import { parseArguments } from "../src/lint-cli/lib/cli/options.ts";
import { collectRepositoryFiles, isFormatCandidate } from "../src/lint-cli/lib/files/collect.ts";
import { ignoredStatePath } from "../src/lint-cli/lib/files/ignored.ts";
import { plan } from "../src/lint-cli/lib/plan/plan.ts";
import { runLint } from "../src/lint-cli/lib/run.ts";
import { readState, writeState } from "../src/lint-cli/lib/state.ts";
import { runContext, TEST_MEMORY } from "./lint-cli-helpers.ts";

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
		const code = await runLint(["--no-oxlint-type-aware"], { cwd: directory, environment: {} });

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
		const code = await runLint(["--no-oxlint-type-aware"], { cwd: directory, environment: {} });

		expect(code).toBe(1);
	});

	it("writes last in a --fix run", async ({ expect, onTestFinished }) => {
		expect.assertions(2);

		const { directory, log } = oxfmtFixture(onTestFinished);
		const code = await runLint(["--fix", "--no-oxlint-type-aware"], {
			cwd: directory,
			environment: {},
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
		const code = await runLint(["--fix", "--no-oxlint-type-aware"], {
			cwd: directory,
			environment: {},
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
		await runLint(["--print"], { cwd: directory, environment: {} });
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
		await runLint(["--no-oxlint-type-aware"], { cwd: bare.directory, environment: {} });
		await runLint(["--no-oxlint-type-aware", "--no-oxfmt"], {
			cwd: disabled.directory,
			environment: {},
		});
		await runLint(["--eslint"], { cwd: single.directory, environment: {} });

		const ranOxfmt = [bare, disabled, single].map(({ log }) => {
			return readRecorded(log).some((child) => child.bin === "oxfmt");
		});

		expect(ranOxfmt).toStrictEqual([false, false, false]);
	});

	it("warns and formats the run's targets when the ESLint ignores cannot be resolved", ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		// The fake ESLint has no config loader and no entry point, so the
		// ignore helper fails.
		const { directory } = oxfmtFixture(onTestFinished);
		const formatted = plan(parseArguments([], {}), runContext(directory, { mutate: true }), {
			format: true,
			memory: TEST_MEMORY,
		}).eager.format;

		expect(formatted!.paths).toStrictEqual(["."]);
		expect(formatted!.notice).toMatch(/could not resolve the ESLint ignores/);
	});

	it("errors clearly when oxfmt is not installed", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const { directory } = oxfmtFixture(onTestFinished, { oxfmt: false });

		await expect(
			runLint(["--no-oxlint-type-aware"], { cwd: directory, environment: {} }),
		).rejects.toThrow(/oxfmt is not installed/);
	});
});

/**
 * A project with a real ESLint config (resolved from this repository's ESLint)
 * that ignores `generated/**` and matches only TS and `.mjs` files.
 *
 * @param onTestFinished - Registers the cleanup.
 * @returns The fixture root.
 */
function eslintIgnoreFixture(onTestFinished: TestContext["onTestFinished"]): string {
	const directory = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-oxfmt-ignored-")),
	);
	onTestFinished(() => {
		fs.rmSync(directory, { force: true, recursive: true });
	});

	fs.writeFileSync(
		path.join(directory, "eslint.config.mjs"),
		'export default [{ files: ["**/*.{ts,mjs}"], rules: {} }, { ignores: ["generated/**"] }];\n',
	);
	fs.writeFileSync(path.join(directory, "oxfmt.config.ts"), "export default {};\n");
	fs.mkdirSync(path.join(directory, "src"));
	fs.mkdirSync(path.join(directory, "generated"));
	fs.writeFileSync(path.join(directory, "src", "a.ts"), "export const a = 1;\n");
	fs.writeFileSync(path.join(directory, "generated", "b.ts"), "export const b = 1;\n");
	// No config matches it, so ESLint does not lint it.
	fs.writeFileSync(path.join(directory, "notes.txt"), "notes\n");
	writeHybridStatus(directory, true);
	return directory;
}

function formatPaths(directory: string, argv: Array<string>, mutate: boolean): Array<string> {
	const formatted = plan(parseArguments(argv, {}), runContext(directory, { mutate }), {
		format: true,
		memory: TEST_MEMORY,
	}).eager.format;
	if (formatted === undefined || formatted.notice !== undefined) {
		throw new Error("expected filtered oxfmt targets");
	}

	return formatted.paths.toSorted();
}

describe("oxfmt targets", () => {
	it("passes only the files ESLint lints", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = eslintIgnoreFixture(onTestFinished);

		expect(formatPaths(directory, [], true)).toStrictEqual([
			"eslint.config.mjs",
			"oxfmt.config.ts",
			"src/a.ts",
		]);
	});

	it("filters with --no-cache and with --print as well", ({ expect, onTestFinished }) => {
		expect.assertions(2);

		const directory = eslintIgnoreFixture(onTestFinished);
		const expected = ["eslint.config.mjs", "oxfmt.config.ts", "src/a.ts"];

		expect(formatPaths(directory, ["--no-cache"], true)).toStrictEqual(expected);
		expect(formatPaths(directory, [], false)).toStrictEqual(expected);
	});

	it("narrows explicit targets the same way", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = eslintIgnoreFixture(onTestFinished);

		expect(formatPaths(directory, ["src", "generated", "notes.txt"], true)).toStrictEqual([
			"src/a.ts",
		]);
	});

	it("runs no oxfmt child when ESLint ignores every target", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		const directory = eslintIgnoreFixture(onTestFinished);
		const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
		onTestFinished(() => {
			write.mockRestore();
		});
		await runLint(["--print", "generated/b.ts", "notes.txt"], {
			cwd: directory,
			environment: {},
		});
		const printed = write.mock.calls.map((call) => String(call[0])).join("");

		expect(printed).not.toContain("oxfmt");
	});
});

/**
 * The oxfmt fixture, with a fake `eslint` package whose config loader is this
 * repository's real one: the lint children stay recording fakes, but the
 * ignore helper (which loads only `lib/config/config-loader.js`) gets a real
 * answer.
 *
 * @param onTestFinished - Registers the cleanup.
 * @returns The fixture root and the recording log.
 */
function realIgnoreFixture(onTestFinished: TestContext["onTestFinished"]): {
	directory: string;
	log: string;
} {
	const fixture = oxfmtFixture(onTestFinished);
	const { directory } = fixture;
	const realEslint = path.dirname(createRequire(import.meta.url).resolve("eslint/package.json"));
	const fakeEslint = path.join(directory, "node_modules", "eslint");
	reexport(
		path.join(fakeEslint, "lib", "config", "config-loader.js"),
		path.join(realEslint, "lib", "config", "config-loader.js"),
	);
	// The runner matches the helper's patterns in-process, with the
	// `@eslint/config-array` the consumer's ESLint resolves.
	const configArray = path.join(fakeEslint, "node_modules", "@eslint", "config-array");
	reexport(
		path.join(configArray, "index.js"),
		createRequire(path.join(realEslint, "package.json")).resolve("@eslint/config-array"),
	);
	fs.writeFileSync(
		path.join(configArray, "package.json"),
		JSON.stringify({ name: "@eslint/config-array", main: "index.js", version: "0.0.0" }),
	);
	fs.writeFileSync(
		path.join(directory, "eslint.config.mjs"),
		'export default [{ files: ["**/*.{ts,mjs}"], rules: {} }, { ignores: ["generated/**"] }];\n',
	);
	fs.mkdirSync(path.join(directory, "generated"));
	fs.writeFileSync(path.join(directory, "generated", "b.ts"), "export const b = 1;\n");
	return fixture;
}

describe("runLint oxfmt targets", () => {
	it.for([
		["--check", []],
		["--write", ["--fix"]],
	] as const)(
		"hands oxfmt only the files ESLint lints (%s)",
		async ([flag, argv], { expect, onTestFinished }) => {
			expect.assertions(2);

			const { directory, log } = realIgnoreFixture(onTestFinished);
			const code = await runLint([...argv, "--no-oxlint-type-aware"], {
				cwd: directory,
				environment: {},
			});
			const oxfmt = readRecorded(log).filter((child) => child.bin === "oxfmt");

			expect(code).toBe(0);
			expect(oxfmt.map((child) => child.argv)).toStrictEqual([
				[
					flag,
					"--config",
					path.join(directory, "oxfmt.config.ts"),
					"--no-error-on-unmatched-pattern",
					"eslint.config.mjs",
					"index.ts",
					"oxfmt.config.ts",
				],
			]);
		},
	);
});

describe("oxfmt candidates", () => {
	it("skips files oxfmt cannot format before classifying them", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = eslintIgnoreFixture(onTestFinished);
		for (const name of ["image.png", "place.rbxm", "style.css", "init.lua", ".babelrc"]) {
			fs.writeFileSync(path.join(directory, name), "x\n");
		}

		const { targeted } = collectRepositoryFiles(directory, ["."]);

		expect(targeted.map((file) => path.basename(file)).toSorted()).toStrictEqual([
			".babelrc",
			"a.ts",
			"b.ts",
			"eslint.config.mjs",
			// Lintable, so the sizing still learns whether ESLint ignores it.
			"init.lua",
			"oxfmt.config.ts",
			"style.css",
		]);
	});

	it("matches oxfmt's extensions and names", ({ expect }) => {
		expect.assertions(1);

		expect(
			[
				"a.vue",
				"a.md",
				"a.yml",
				"a.toml",
				"a.TS",
				"a.lua",
				"x.tfstate.backup",
				"glide.lock",
				"a.lock",
				"Jakefile",
			].map(isFormatCandidate),
		).toStrictEqual([true, true, true, true, false, false, true, true, false, true]);
	});

	it("keeps Lua out of the oxfmt list", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = eslintIgnoreFixture(onTestFinished);
		fs.writeFileSync(
			path.join(directory, "eslint.config.mjs"),
			'export default [{ files: ["**/*.{ts,mjs,lua}"], rules: {} }];\n',
		);
		fs.writeFileSync(path.join(directory, "init.lua"), "local a = 1\n");

		expect(formatPaths(directory, ["init.lua", "src"], true)).toStrictEqual(["src/a.ts"]);
	});
});

describe("oxfmt targets under --no-cache", () => {
	it("memoizes the ignore answer without spawning the helper again", ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		const directory = eslintIgnoreFixture(onTestFinished);
		// The config hash needs a resolvable TypeScript.
		fs.mkdirSync(path.join(directory, "node_modules"));
		fs.symlinkSync(
			path.dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
			path.join(directory, "node_modules", "typescript"),
			"junction",
		);
		const expected = ["eslint.config.mjs", "oxfmt.config.ts", "src/a.ts"];

		expect(formatPaths(directory, ["--no-cache"], true)).toStrictEqual(expected);
		expect(fs.existsSync(ignoredStatePath(runContext(directory, { mutate: true })))).toBe(true);

		// Mark `src/a.ts` ignored in the memo: the next run only reports that
		// if it read the memo rather than asking the helper again.
		const stateFile = ignoredStatePath(runContext(directory, { mutate: true }));
		const state = readState<{ classified: { ignored: Array<string>; linted: Array<string> } }>(
			stateFile,
		)!;
		const key = state.classified.linted.find((file) => file.endsWith("src/a.ts"))!;
		state.classified.linted = state.classified.linted.filter((file) => file !== key);
		state.classified.ignored.push(key);
		writeState(stateFile, state);

		expect(formatPaths(directory, ["--no-cache"], true)).toStrictEqual(
			expected.filter((file) => file !== "src/a.ts"),
		);
	});
});

describe("explicit oxfmt targets", () => {
	it("classifies a target that exists but is not listed", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = eslintIgnoreFixture(onTestFinished);
		git(directory, ["init", "--quiet"]);
		fs.writeFileSync(path.join(directory, ".gitignore"), "dist/\n");
		fs.mkdirSync(path.join(directory, "dist"));
		fs.writeFileSync(path.join(directory, "dist", "out.ts"), "export const out = 1;\n");

		expect(formatPaths(directory, ["dist/out.ts", "src/a.ts"], true)).toStrictEqual([
			"dist/out.ts",
			"src/a.ts",
		]);
	});

	it("falls back to the targets as given for a glob", ({ expect, onTestFinished }) => {
		expect.assertions(2);

		const directory = eslintIgnoreFixture(onTestFinished);
		const formatted = plan(
			parseArguments(["src/**/*.ts", "generated"], {}),
			runContext(directory, { mutate: true }),
			{ format: true, memory: TEST_MEMORY },
		).eager.format;

		expect(formatted!.paths).toStrictEqual(["src/**/*.ts", "generated"]);
		expect(formatted!.notice).toMatch(/matches no file/);
	});

	it("does not fall back for a deleted file the listing still holds", ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		const directory = eslintIgnoreFixture(onTestFinished);
		git(directory, ["init", "--quiet"]);
		git(directory, ["add", "."]);
		fs.rmSync(path.join(directory, "src", "a.ts"));

		expect(formatPaths(directory, ["src/a.ts", "generated"], true)).toStrictEqual(["src/a.ts"]);
	});

	it.runIf(process.platform === "win32")(
		"falls back for a directory spelled in another case",
		({ expect, onTestFinished }) => {
			expect.assertions(1);

			const directory = eslintIgnoreFixture(onTestFinished);
			const formatted = plan(
				parseArguments(["SRC"], {}),
				runContext(directory, { mutate: true }),
				{ format: true, memory: TEST_MEMORY },
			).eager.format;

			expect(formatted!.paths).toStrictEqual(["SRC"]);
		},
	);

	it("drops targets outside the cwd, which ESLint does not lint", ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		const directory = eslintIgnoreFixture(onTestFinished);
		const outside = path.join(path.dirname(directory), "elsewhere.ts");

		expect(formatPaths(directory, ["src", "../elsewhere.ts", outside], true)).toStrictEqual([
			"src/a.ts",
		]);
	});
});

function git(directory: string, args: Array<string>): void {
	execFileSync("git", args, { cwd: directory, stdio: "ignore" });
}

/**
 * Write a CommonJS module that re-exports another.
 *
 * @param file - The module to write.
 * @param target - The absolute path of the module it re-exports.
 */
function reexport(file: string, target: string): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `module.exports = require(${JSON.stringify(target)});\n`);
}
