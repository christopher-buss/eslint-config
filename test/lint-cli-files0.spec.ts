// cspell:words pids ünïcödé
import { Buffer } from "node:buffer";
import type { ChildProcess } from "node:child_process";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { TestContext } from "vitest";
import { describe, it } from "vitest";

import { isRecord, isStringArray } from "../src/guards.ts";
import { writeHybridStatus } from "../src/hybrid-status.ts";
import { parseArguments } from "../src/lint-cli/lib/cli/options.ts";
import { CliError } from "../src/lint-cli/lib/cli/types.ts";
import { executeStaged } from "../src/lint-cli/lib/exec/execute.ts";
import { runLint } from "../src/lint-cli/lib/run.ts";
import { withoutGitEnvironment } from "./without-git.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_ENTRY = path.join(REPO_ROOT, "src", "lint-cli", "index.ts");
const BOOTSTRAP = path.join(REPO_ROOT, "src", "lint-cli", "bootstrap.ts");

/**
 * Names that break any path list a shell or a newline-separated pipe touches.
 * A newline and `*` are not legal Windows filename characters, so they only
 * join the set elsewhere.
 */
const ODD_NAMES = [
	"plain.ts",
	"has space.ts",
	"ünïcödé-名前.ts",
	"semi;amp&$(sub)`tick`'quote'.ts",
	"-leading-hyphen.ts",
	"[brackets]{braces}.ts",
	"100%PATH%.ts",
	...(process.platform === "win32" ? [] : ["glob*star.ts", "new\nline.ts"]),
];

/**
 * Files named exactly like flags ESLint's bin scans the raw argv for (ignoring
 * `--`). Passed bare, `--init` would start the config wizard and `--stdin`
 * would lint stdin instead of the file.
 */
const TRAP_NAMES = ["--init", "--stdin"];

/** Every name a fixture selects. */
const SELECTED = [...ODD_NAMES, ...TRAP_NAMES];

/**
 * A selected path as the engines must receive it: a hyphen-led relative path
 * is anchored with `./` so no engine can read it as a flag.
 *
 * @param target - The listed path.
 * @returns The argument the engine receives.
 */
function asArgument(target: string): string {
	return target.startsWith("-") ? `./${target}` : target;
}

/** The file every fixture leaves out of its list. */
const UNSELECTED = "unselected.ts";

/** One engine child as a recording fake bin saw it. */
interface RecordedChild {
	argv: Array<string>;
	bin: string;
	typeAware: null | string;
}

function temporaryDirectory(onTestFinished: TestContext["onTestFinished"]): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-files0-"));
	onTestFinished(() => {
		fs.rmSync(directory, { force: true, recursive: true });
	});

	return fs.realpathSync(directory);
}

function writeFakeToolBin(directory: string, name: string, body: string): string {
	const packageDirectory = path.join(directory, "node_modules", name);
	fs.mkdirSync(packageDirectory, { recursive: true });
	fs.writeFileSync(
		path.join(packageDirectory, "package.json"),
		JSON.stringify({ name, bin: { [name]: "bin.js" }, version: "0.0.0" }),
	);
	const bin = path.join(packageDirectory, "bin.js");
	fs.writeFileSync(bin, body);
	return bin;
}

/**
 * A fake engine bin that appends the argv and pass it was launched with to a
 * JSON-lines log, then exits cleanly.
 *
 * @param log - The log file.
 * @param name - The engine the bin stands in for.
 * @returns The bin source.
 */
function recordingBin(log: string, name: string): string {
	return (
		'const fs=require("node:fs");' +
		`fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({` +
		`bin:${JSON.stringify(name)},argv:process.argv.slice(2),` +
		"typeAware:process.env.ESLINT_TYPE_AWARE??null})+String.fromCharCode(10));" +
		"process.exitCode=0;"
	);
}

function isRecordedChild(value: unknown): value is RecordedChild {
	return isRecord(value) && typeof value["bin"] === "string" && isStringArray(value["argv"]);
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
			if (!isRecordedChild(parsed)) {
				throw new TypeError(`unexpected log line: ${line}`);
			}

			return parsed;
		});
}

/**
 * A fixture whose engines are recording fakes, holding one file per odd name
 * plus one the lists never select.
 *
 * @param onTestFinished - Registers the cleanup.
 * @returns The fixture root and the recording log.
 */
function recordingFixture(onTestFinished: TestContext["onTestFinished"]): {
	directory: string;
	log: string;
} {
	const directory = temporaryDirectory(onTestFinished);
	const log = path.join(directory, "children.jsonl");
	writeFakeToolBin(directory, "eslint", recordingBin(log, "eslint"));
	writeFakeToolBin(directory, "oxlint", recordingBin(log, "oxlint"));
	writeHybridStatus(directory, true);
	for (const name of [...SELECTED, UNSELECTED]) {
		fs.writeFileSync(path.join(directory, name), "export const value = 1;\n");
	}

	return { directory, log };
}

function encodeList(paths: Array<string>): Buffer {
	return Buffer.from(paths.map((entry) => `${entry}\0`).join(""), "utf8");
}

function stdinOf(bytes: Uint8Array): Readable {
	return Readable.from([Buffer.from(bytes)]);
}

/**
 * The lint targets a recorded child received, which always end its argv.
 *
 * @param child - The recorded child.
 * @param count - How many targets the run selected.
 * @returns The trailing target arguments.
 */
function targetsOf(child: RecordedChild, count: number): Array<string> {
	return child.argv.slice(-count);
}

async function runQuietly(
	argv: Array<string>,
	directory: string,
	stdin: Readable = Readable.from([]),
	environment: NodeJS.ProcessEnv = {},
): Promise<number> {
	return withoutGitEnvironment(async () => runLint(argv, directory, environment, stdin));
}

describe("--files0-from parsing", () => {
	it("leaves the paths empty for the list to fill, never the '.' default", ({ expect }) => {
		expect.assertions(2);

		const options = parseArguments(["--files0-from", "-"], {});

		expect(options.filesFrom).toBe("-");
		expect(options.paths).toStrictEqual([]);
	});

	it("accepts the inline form", ({ expect }) => {
		expect.assertions(1);

		expect(parseArguments(["--files0-from=list.bin"], {}).filesFrom).toBe("list.bin");
	});

	it("refuses positional paths alongside a list", ({ expect }) => {
		expect.assertions(1);

		expect(() => parseArguments(["--files0-from", "-", "src"], {})).toThrow(
			/Cannot combine --files0-from with positional paths/,
		);
	});

	it("refuses a repeated or empty --files0-from", ({ expect }) => {
		expect.assertions(3);

		expect(() => parseArguments(["--files0-from", "a", "--files0-from=b"], {})).toThrow(
			CliError,
		);
		expect(() => parseArguments(["--files0-from="], {})).toThrow(CliError);
		expect(() => parseArguments(["--files0-from"], {})).toThrow(CliError);
	});

	it("refuses ESLint's stdin source flags, which the engine's stdin cannot serve", ({
		expect,
	}) => {
		expect.assertions(3);

		expect(() => parseArguments(["--eslint-args", "--stdin"], {})).toThrow(/--stdin/);
		expect(() => {
			return parseArguments(
				["--files0-from", "-", "--eslint-args", "--stdin-filename=a"],
				{},
			);
		}).toThrow(/--stdin-filename/);
		expect(() => parseArguments(["--eslint", "--", "--stdin"], {})).toThrow(/--stdin/);
	});
});

describe("runLint --files0-from", () => {
	it("treats an empty list as a successful no-op that spawns nothing", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		const { directory, log } = recordingFixture(onTestFinished);
		const listFile = path.join(directory, "empty.list");
		fs.writeFileSync(listFile, "");

		await expect(
			runQuietly(["--files0-from", "-"], directory, stdinOf(new Uint8Array())),
		).resolves.toBe(0);
		await expect(runQuietly(["--files0-from", listFile], directory)).resolves.toBe(0);
		expect(readRecorded(log)).toStrictEqual([]);
	});

	it("rejects a list that is not valid UTF-8 without linting anything", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		const { directory, log } = recordingFixture(onTestFinished);
		const bytes = Buffer.concat([encodeList(["plain.ts"]), Buffer.from([0xff, 0xfe, 0])]);

		await expect(runQuietly(["--files0-from", "-"], directory, stdinOf(bytes))).rejects.toThrow(
			/not valid UTF-8/,
		);
		expect(readRecorded(log)).toStrictEqual([]);
	});

	it("rejects an empty entry rather than guessing what it meant", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		const { directory, log } = recordingFixture(onTestFinished);
		const bytes = Buffer.from("plain.ts\0\0has space.ts\0", "utf8");

		await expect(runQuietly(["--files0-from", "-"], directory, stdinOf(bytes))).rejects.toThrow(
			/entry 2 of the file list is empty/,
		);
		expect(readRecorded(log)).toStrictEqual([]);
	});

	it("rejects an unreadable list file", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const { directory } = recordingFixture(onTestFinished);

		await expect(runQuietly(["--files0-from", "missing.list"], directory)).rejects.toThrow(
			/cannot read "missing.list"/,
		);
	});

	it("hands every engine of a concurrent run the exact selected paths", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		const { directory, log } = recordingFixture(onTestFinished);
		const selected = SELECTED;
		const code = await runQuietly(
			["--files0-from", "-", "--type-aware=off", "--no-oxlint-type-aware", "--no-agents"],
			directory,
			stdinOf(encodeList(selected)),
		);
		const children = readRecorded(log);

		expect(code).toBe(0);
		expect(children.map((child) => child.bin).toSorted()).toStrictEqual(["eslint", "oxlint"]);
		// A hyphen-led name would read as a flag, so both engines get it
		// anchored.
		expect(children.map((child) => targetsOf(child, selected.length))).toStrictEqual([
			selected.map(asArgument),
			selected.map(asArgument),
		]);
	});

	it("hands a sequential run's lone engine the exact selected paths, read from a file", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		const { directory, log } = recordingFixture(onTestFinished);
		const selected = SELECTED;
		const listFile = path.join(directory, "selection.list");
		fs.writeFileSync(listFile, encodeList(selected));

		const code = await runQuietly(
			["--eslint", "--type-aware=full", "--files0-from", listFile, "--no-agents"],
			directory,
		);
		const children = readRecorded(log);

		expect(code).toBe(0);
		expect(children).toHaveLength(1);
		expect(targetsOf(children[0]!, selected.length)).toStrictEqual(selected.map(asArgument));
	});

	it("carries 5,000 distinct files (well past any command-line limit) in one run", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(5);

		const { directory, log } = recordingFixture(onTestFinished);
		// Distinct real files, so planning, caching and worker sizing all see
		// 5,000 targets; the list alone is several times what CreateProcessW
		// (32,767 chars) could ever carry.
		const selected = Array.from({ length: 5000 }, (_, index) => {
			return `many/${String(index % 50)}/${String(index)}-${ODD_NAMES[index % ODD_NAMES.length]!}`;
		});
		for (let bucket = 0; bucket < 50; bucket += 1) {
			fs.mkdirSync(path.join(directory, "many", String(bucket)), { recursive: true });
		}

		for (const file of selected) {
			fs.writeFileSync(path.join(directory, file), "");
		}

		const listBytes = encodeList(selected);
		const code = await runQuietly(
			["--files0-from", "-", "--type-aware=off", "--no-oxlint-type-aware", "--no-agents"],
			directory,
			stdinOf(listBytes),
			{ LINT_MAX_WORKERS: "4" },
		);
		const children = readRecorded(log);
		const eslintArgv = children.find((child) => child.bin === "eslint")!.argv;

		expect(listBytes.byteLength).toBeGreaterThan(64 * 1024);
		expect(code).toBe(0);
		// One child per engine, each holding the whole list: no batching.
		expect(children.map((child) => child.bin).toSorted()).toStrictEqual(["eslint", "oxlint"]);
		expect(children.map((child) => targetsOf(child, selected.length))).toStrictEqual([
			selected,
			selected,
		]);
		// Sized from 5,000 dirty files, not from a handful: the fast pass packs
		// 800 files per worker, so this reaches the cap.
		expect(eslintArgv[eslintArgv.indexOf("--concurrency") + 1]).toBe("4");
	}, 60_000);
});

describe("engine bootstrap", () => {
	/**
	 * Run the bootstrap over a fake engine that prints the argv it was given.
	 *
	 * @param directory - Where to write the fake engine.
	 * @param stdin - What to stream to the bootstrap.
	 * @returns The bootstrap's exit status and output.
	 */
	async function runBootstrap(
		directory: string,
		stdin: string,
	): Promise<{ bin: string; code: null | number; stderr: string; stdout: string }> {
		const bin = path.join(directory, "engine.mjs");
		fs.writeFileSync(
			bin,
			"import process from 'node:process';" +
				"process.stdout.write(JSON.stringify({argv:process.argv}));",
		);

		return new Promise((resolve, reject) => {
			const child = spawn(process.execPath, [BOOTSTRAP, bin], { cwd: directory });
			let stdout = "";
			let stderr = "";
			child.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});
			child.stderr.on("data", (chunk: Buffer) => {
				stderr += chunk.toString("utf8");
			});
			child.on("error", reject);
			child.on("close", (code) => {
				resolve({ bin, code, stderr, stdout });
			});
			child.stdin.end(stdin);
		});
	}

	it("installs the streamed arguments as the engine's own argv", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		const directory = temporaryDirectory(onTestFinished);
		const args = ["--flag", "value with space", "--", ...ODD_NAMES, "x".repeat(70_000)];
		const { bin, code, stdout } = await runBootstrap(directory, JSON.stringify(args));

		expect(code).toBe(0);
		expect(JSON.parse(stdout)).toStrictEqual({ argv: [process.execPath, bin, ...args] });
	});

	it("exits 2 with a message when the argument payload is malformed", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(4);

		const directory = temporaryDirectory(onTestFinished);
		const notJson = await runBootstrap(directory, "not json");
		const notStrings = await runBootstrap(directory, JSON.stringify(["ok", 1]));

		expect(notJson.code).toBe(2);
		expect(notJson.stderr).toMatch(/could not start the engine/);
		expect(notStrings.code).toBe(2);
		expect(notStrings.stdout).toBe("");
	});
});

/**
 * Whether a process is still alive.
 *
 * @param pid - The process id.
 * @returns True while the process exists.
 */
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error("timed out waiting for condition");
		}

		await new Promise((resolve) => {
			setTimeout(resolve, 50);
		});
	}
}

function gitFreeEnvironment(): NodeJS.ProcessEnv {
	const environment: NodeJS.ProcessEnv = { ...process.env };
	for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) {
		delete environment[key];
	}

	return environment;
}

async function exitOf(child: ChildProcess): Promise<null | number> {
	return new Promise((resolve) => {
		child.on("close", (code) => {
			resolve(code);
		});
	});
}

describe.skipIf(process.platform === "win32")("cancellation", () => {
	/**
	 * Start the CLI over engines that record their pid and then hang, and
	 * cancel it with SIGTERM once every expected engine is running.
	 *
	 * @param argv - The CLI arguments.
	 * @param engines - How many engine children the run starts.
	 * @param onTestFinished - Registers the cleanup.
	 * @returns The CLI's exit code and the engine pids.
	 */
	async function cancelRun(
		argv: Array<string>,
		engines: number,
		onTestFinished: TestContext["onTestFinished"],
	): Promise<{ code: null | number; pids: Array<number> }> {
		const directory = temporaryDirectory(onTestFinished);
		const pidDirectory = path.join(directory, "pids");
		fs.mkdirSync(pidDirectory);
		const hang =
			'const fs=require("node:fs");' +
			`fs.writeFileSync(require("node:path").join(${JSON.stringify(pidDirectory)},String(process.pid)),"");` +
			"setInterval(()=>{},1000);";
		writeFakeToolBin(directory, "eslint", hang);
		writeFakeToolBin(directory, "oxlint", hang);
		writeHybridStatus(directory, true);
		fs.writeFileSync(path.join(directory, "a.ts"), "export {};\n");

		const cli = spawn(process.execPath, [CLI_ENTRY, ...argv], {
			cwd: directory,
			env: gitFreeEnvironment(),
			stdio: ["pipe", "ignore", "ignore"],
		});
		cli.stdin.end(encodeList(["a.ts"]));
		const exited = exitOf(cli);
		function pids(): Array<number> {
			return fs.readdirSync(pidDirectory).map(Number);
		}

		onTestFinished(() => {
			for (const pid of pids()) {
				if (isAlive(pid)) {
					process.kill(pid, "SIGKILL");
				}
			}
		});

		await waitFor(() => pids().length === engines, 20_000);
		cli.kill("SIGTERM");
		const code = await exited;
		return { code, pids: pids() };
	}

	it("stops every engine of a concurrent run and exits with the signal's code", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		const { code, pids } = await cancelRun(
			["--files0-from", "-", "--type-aware=off", "--no-oxlint-type-aware", "--no-agents"],
			2,
			onTestFinished,
		);
		await waitFor(() => pids.every((pid) => !isAlive(pid)), 5000).catch(() => {});

		expect(code).toBe(143);
		expect(pids.filter((pid) => isAlive(pid))).toStrictEqual([]);
	}, 40_000);

	it("stops the engine of a sequential run and starts nothing after it", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		// A fix run starts oxlint alone first; cancelling it must not go on to
		// spawn the ESLint checks.
		const { code, pids } = await cancelRun(
			["--fix", "--files0-from", "-", "--no-oxlint-type-aware", "--no-agents"],
			1,
			onTestFinished,
		);
		await waitFor(() => pids.every((pid) => !isAlive(pid)), 5000).catch(() => {});

		expect(code).toBe(143);
		expect(pids).toHaveLength(1);
		expect(pids.filter((pid) => isAlive(pid))).toStrictEqual([]);
	}, 40_000);
});

/**
 * Kill the process whose pid a fake engine recorded, if it is still running.
 *
 * @param pidFile - The file the engine wrote its pid to.
 */
function killRecordedPid(pidFile: string): void {
	const pid = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, "utf8")) : 0;
	if (pid > 0 && isAlive(pid)) {
		process.kill(pid, "SIGKILL");
	}
}

describe.skipIf(process.platform === "win32")("staged cancellation", () => {
	it("starts no deferred child after a SIGINT during planning, fails, and resets per run", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		const { directory, log } = recordingFixture(onTestFinished);
		const pidFile = path.join(directory, "eager.pid");
		writeFakeToolBin(
			directory,
			"oxlint",
			`require("node:fs").writeFileSync(${JSON.stringify(pidFile)},String(process.pid));` +
				"setInterval(()=>{},1000);",
		);
		onTestFinished(() => {
			killRecordedPid(pidFile);
		});

		const code = await executeStaged(
			[{ args: [], bin: "oxlint", env: {}, label: "oxc" }],
			directory,
			() => {
				// Stands in for a Ctrl+C pressed while the TypeScript builder
				// blocks the event loop: the listeners run, the planner returns.
				process.emit("SIGINT", "SIGINT");
				return [{ args: [], bin: "eslint", env: {}, label: "typed" }];
			},
		);

		// The eager child was killed (KillOnSignal reports that as a success),
		// the deferred one never started, and the run still failed.
		expect(code).toBe(130);
		expect(readRecorded(log)).toStrictEqual([]);
		// A later run in the same process is not refused for that signal.
		await expect(
			runQuietly(
				["--eslint", "--type-aware=full", "--no-agents", "--files0-from", "-"],
				directory,
				stdinOf(encodeList(["plain.ts"])),
			),
		).resolves.toBe(0);
	}, 30_000);
});

/**
 * A fixture linted by the repository's own ESLint and oxlint. It lives under
 * the repository's `node_modules/.cache` so both engines resolve from it, and
 * is its own git repository so the runner's `git ls-files` lists its files
 * rather than the (ignored) slice of this one.
 *
 * Each file trips one ESLint rule with a fix (`prefer-const`) and one oxlint
 * rule (`no-debugger`), so a run's output names every file each engine linted.
 *
 * @param onTestFinished - Registers the cleanup.
 * @param withDebugger - Whether the files also trip oxlint.
 * @returns The fixture root.
 */
function realEngineFixture(
	onTestFinished: TestContext["onTestFinished"],
	withDebugger: boolean,
): string {
	const parent = path.join(REPO_ROOT, "node_modules", ".cache", "lint-cli-files0");
	fs.mkdirSync(parent, { recursive: true });
	const directory = fs.mkdtempSync(path.join(parent, "fixture-"));
	onTestFinished(() => {
		fs.rmSync(directory, { force: true, recursive: true });
	});

	execFileSync("git", ["init", "-q", "."], { cwd: directory, env: gitFreeEnvironment() });
	fs.writeFileSync(
		path.join(directory, "eslint.config.mjs"),
		"export default [{ files: ['**/*.ts'], settings: { 'isentinel/oxlint': true }, " +
			"rules: { 'prefer-const': 'error' } }];\n",
	);
	fs.writeFileSync(
		path.join(directory, ".oxlintrc.json"),
		JSON.stringify({ rules: { "no-debugger": "error" } }),
	);
	const body = `let value = 1;\n${withDebugger ? "debugger;\n" : ""}export default value;\n`;
	for (const name of [...SELECTED, UNSELECTED]) {
		fs.writeFileSync(path.join(directory, name), body);
	}

	return directory;
}

async function runCli(
	directory: string,
	argv: Array<string>,
	list: Uint8Array,
): Promise<{ code: null | number; output: string }> {
	const environment = gitFreeEnvironment();
	delete environment["CI"];
	const child = spawn(process.execPath, [CLI_ENTRY, ...argv], {
		cwd: directory,
		env: environment,
		stdio: ["pipe", "pipe", "pipe"],
	});
	let output = "";
	child.stdout.on("data", (chunk: Buffer) => {
		output += chunk.toString("utf8");
	});
	child.stderr.on("data", (chunk: Buffer) => {
		output += chunk.toString("utf8");
	});
	child.stdin.end(list);
	const code = await exitOf(child);
	return { code, output };
}

describe("isentinel-lint over real engines", () => {
	const selected = SELECTED;
	const checkArgs = ["--files0-from", "-", "--no-oxlint-type-aware", "--no-agents"];

	it("lints exactly the listed files with both engines, then skips the typed pass", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(7);

		const directory = realEngineFixture(onTestFinished, true);
		const first = await runCli(directory, checkArgs, encodeList(selected));
		const second = await runCli(directory, checkArgs, encodeList(selected));

		expect(first.code).toBe(1);
		expect(first.output).toContain("[oxc] spawned oxlint");
		// Every selected file is reported by its literal name (a newline-bearing
		// one arrives split across two prefixed lines)...
		expect(
			ODD_NAMES.filter((name) => {
				return name.split("\n").some((part) => !first.output.includes(part));
			}),
		).toStrictEqual([]);
		expect(first.output.match(/no-debugger/g)).toHaveLength(ODD_NAMES.length);
		// The flag-named files stayed files: no wizard, no stdin lint.
		expect(first.output).not.toMatch(/@eslint\/config|<text>/);
		// ...and never the one the list left out.
		expect(first.output).not.toContain(UNSELECTED);
		// Nothing type-relevant changed between the runs.
		expect(second.output).toContain("skipping the type-aware ESLint pass");
	}, 60_000);

	it("fixes exactly the listed files", async ({ expect, onTestFinished }) => {
		expect.assertions(3);

		const directory = realEngineFixture(onTestFinished, false);
		const { code } = await runCli(directory, ["--fix", ...checkArgs], encodeList(selected));
		function fixed(name: string): boolean {
			return fs.readFileSync(path.join(directory, name), "utf8").startsWith("const ");
		}

		expect(code).toBe(0);
		expect(ODD_NAMES.filter((name) => !fixed(name))).toStrictEqual([]);
		expect(fixed(UNSELECTED)).toBe(false);
	}, 60_000);

	it("lints a 5,000-path list in one invocation without overflowing a command line", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(4);

		const directory = realEngineFixture(onTestFinished, true);
		const list = Array.from({ length: 5000 }, (_, index) => {
			return `${"./".repeat(index % 13)}${ODD_NAMES[index % ODD_NAMES.length]!}`;
		});
		const { code, output } = await runCli(directory, checkArgs, encodeList(list));

		expect(code).toBe(1);
		expect(output).not.toMatch(/ENAMETOOLONG|E2BIG|could not start the engine/);
		expect(output.match(/no-debugger/g)).toHaveLength(ODD_NAMES.length);
		expect(output).not.toContain(UNSELECTED);
	}, 60_000);
});
