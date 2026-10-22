/**
 * Runs the real ESLint, oxlint and oxfmt CLIs over a scratch project in both
 * formatter modes, so the parity suite can compare what each mode writes.
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { isRecord } from "../../src/guards.ts";
import { parseArguments } from "../../src/lint-cli/lib/cli/options.ts";
import { composeOxfmtCommand } from "../../src/lint-cli/lib/plan/command.ts";
import {
	changedFiles,
	prepareProject,
	PROJECT_ROOT,
	readTree,
	stripConfigFiles,
	toPosix,
} from "./project.ts";
import type { Mode, Scenario, Tree } from "./project.ts";

const ESLINT_BIN = binary("eslint", "bin/eslint.js");
const OXFMT_BIN = binary("oxfmt", "bin/oxfmt");
const OXLINT_BIN = binary("oxlint", "bin/oxlint");

/** Loop guard: a stable tree needs at most this many rounds. */
const MAX_ROUNDS = 4;

/** What one mode produced. */
export interface ModeResult {
	/**
	 * Parse failures and other fatal ESLint problems in the settled tree, as
	 * `path: message`. Both modes must report the same ones.
	 */
	fatal: Array<string>;
	/** Rounds the mode needed to settle. */
	rounds: number;
	/** The settled tree, config files excluded. */
	tree: Tree;
	/** What the tools printed on stderr, for warnings. */
	warnings: string;
}

interface ProcessResult {
	code: number;
	stderr: string;
	stdout: string;
}

interface EslintMessage {
	fatal?: boolean;
	fix?: unknown;
	message: string;
	ruleId: null | string;
}

interface EslintResult {
	filePath: string;
	messages: Array<EslintMessage>;
}

/** One round's tools, run over the project. */
interface Round {
	oxfmtConfig: string | undefined;
	root: string;
	runDirectory: string;
	scenario: Scenario;
}

/**
 * Run a scenario's project in one mode until it settles: each round runs
 * `eslint --fix` (after `oxlint --fix` in hybrid mode), then in standalone
 * mode `oxfmt --write` the way isentinel-lint invokes it.
 *
 * @param scenario - What to set up and run.
 * @param mode - Which formatter setup to write.
 * @returns The settled tree.
 * @rejects When a tool fails, the tree never settles, or a settled tree still
 *   has fixable or unformatted files; the message names the mode.
 */
export async function runMode(scenario: Scenario, mode: Mode): Promise<ModeResult> {
	const root = await prepareProject(scenario, mode);
	try {
		if (scenario.git === true) {
			await run("git", ["init", "--quiet"], root);
		}

		return await settle(scenario, mode, root);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`[${mode} mode] ${message}`, { cause: err });
	} finally {
		await fs.rm(root, { force: true, recursive: true });
	}
}

async function run(command: string, args: Array<string>, cwd: string): Promise<ProcessResult> {
	return new Promise((resolve) => {
		execFile(
			command,
			args,
			{
				cwd,
				env: { ...process.env, ESLINT_TYPE_AWARE: undefined },
				maxBuffer: 64 * 1024 * 1024,
				windowsHide: true,
			},
			(error, stdout, stderr) => {
				let code = 0;
				if (error !== null) {
					code = typeof error.code === "number" ? error.code : 1;
				}

				resolve({ code, stderr, stdout });
			},
		);
	});
}

async function runOxfmt(cwd: string, configPath: string, write: boolean): Promise<ProcessResult> {
	// The arguments isentinel-lint passes for a whole-tree run.
	const { args } = composeOxfmtCommand(parseArguments(["."], {}), { configPath, write });
	return run(process.execPath, [OXFMT_BIN, ...args], cwd);
}

function check(result: ProcessResult, tool: string, codes: Array<number>): void {
	if (!codes.includes(result.code)) {
		throw new Error(`${tool} exited with ${result.code}:\n${result.stderr}${result.stdout}`);
	}
}

function toMessage(message: Record<string, unknown>): EslintMessage {
	return {
		fatal: message["fatal"] === true,
		fix: message["fix"],
		message: String(message["message"]),
		ruleId: typeof message["ruleId"] === "string" ? message["ruleId"] : null,
	};
}

function parseResults(stdout: string): Array<EslintResult> {
	const parsed: unknown = JSON.parse(stdout);
	if (!Array.isArray(parsed) || parsed.some((file) => !isRecord(file))) {
		throw new TypeError(`unexpected ESLint output: ${stdout.slice(0, 200)}`);
	}

	return parsed.map((file: Record<string, unknown>) => {
		const { messages } = file;
		return {
			filePath: String(file["filePath"]),
			messages: Array.isArray(messages)
				? messages.filter((message) => isRecord(message)).map(toMessage)
				: [],
		};
	});
}

async function runRound({
	oxfmtConfig,
	runDirectory,
	scenario,
}: Round): Promise<{ results: Array<EslintResult>; stderr: string }> {
	let stderr = "";
	if (scenario.oxlint === true) {
		const oxlint = await run(process.execPath, [OXLINT_BIN, "--fix", "."], runDirectory);
		check(oxlint, "oxlint", [0, 1]);
		stderr += oxlint.stderr;
	}

	const args = [ESLINT_BIN, "--format", "json", "--no-warn-ignored", "--fix", "."];
	const eslint = await run(process.execPath, args, runDirectory);
	check(eslint, "eslint", [0, 1]);
	stderr += eslint.stderr;

	if (oxfmtConfig !== undefined) {
		check(await runOxfmt(runDirectory, oxfmtConfig, true), "oxfmt --write", [0]);
	}

	return { results: parseResults(eslint.stdout), stderr };
}

function relativeTo(root: string, file: string): string {
	return toPosix(path.relative(root, file));
}

/**
 * After the tree settles: the last `eslint --fix` must leave no fixable
 * problem, and oxfmt (when it runs) must find every file formatted.
 *
 * @param round - The settled round.
 * @param results - The last `eslint --fix` results.
 * @rejects When either check fails.
 */
async function assertClean(
	{ oxfmtConfig, root, runDirectory }: Round,
	results: Array<EslintResult>,
): Promise<void> {
	const fixable = results.flatMap((file) => {
		return file.messages
			.filter((message) => message.fix !== undefined)
			.map((message) => {
				return `${relativeTo(root, file.filePath)}: ${message.ruleId}: ${message.message}`;
			});
	});
	if (fixable.length > 0) {
		throw new Error(`eslint still reports fixable problems:\n${fixable.join("\n")}`);
	}

	if (oxfmtConfig !== undefined) {
		check(await runOxfmt(runDirectory, oxfmtConfig, false), "oxfmt --check", [0]);
	}
}

function fatalProblems(root: string, results: Array<EslintResult>): Array<string> {
	return results
		.flatMap((file) => {
			return file.messages
				.filter((message) => message.fatal === true || message.ruleId === null)
				.map((message) => `${relativeTo(root, file.filePath)}: ${message.message}`);
		})
		.sort();
}

async function settle(scenario: Scenario, mode: Mode, root: string): Promise<ModeResult> {
	const round: Round = {
		oxfmtConfig:
			mode === "standalone" && scenario.oxfmt !== null
				? path.join(root, "oxfmt.config.ts")
				: undefined,
		root,
		runDirectory: path.join(root, scenario.cwd ?? "."),
		scenario,
	};

	let warnings = "";
	let changed: Array<string> = [];
	let previous = await readTree(root);
	for (let count = 1; count <= MAX_ROUNDS; count++) {
		const { results, stderr } = await runRound(round);
		warnings += stderr;

		const current = await readTree(root);
		changed = changedFiles(previous, current);
		if (changed.length === 0) {
			await assertClean(round, results);
			const tree = stripConfigFiles(current, scenario, mode);
			return { fatal: fatalProblems(root, results), rounds: count, tree, warnings };
		}

		previous = current;
	}

	throw new Error(
		`did not settle after ${MAX_ROUNDS} rounds; still changing: ${changed.join(", ")}`,
	);
}

function binary(name: string, entry: string): string {
	return path.join(PROJECT_ROOT, "node_modules", name, entry);
}
