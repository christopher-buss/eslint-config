import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { isRecord } from "../src/guards.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

const isWindows = os.platform() === "win32";

/** Spawning the binary is slow enough on Windows to need its own budget. */
export const OXLINT_TIMEOUT = isWindows ? 300_000 : 120_000;

/**
 * Root for the directories the oxlint specs lint.
 *
 * Deliberately not `_fixtures`, the root the ESLint specs use: since oxlint
 * 1.78 the file walker reads `.gitignore` files from every ancestor up to the
 * git root, this repository ignores `_fixtures`, and `--no-ignore` only covers
 * `.eslintignore`. Fixtures written there are invisible to oxlint, which then
 * lints zero files. The system temp directory sits outside any repository, so
 * no ancestor `.gitignore` applies.
 */
export const OXLINT_FIXTURES_TEMP = path.join(os.tmpdir(), "isentinel-oxlint-fixtures");

interface OxlintDiagnostic {
	// oxlint omits `code` for some diagnostics; keep it optional so the runtime
	/**
	 * Shape (and the resulting `"file:line undefined"` string) is preserved.
	 */
	code?: string;
	filename: string;
	labels: Array<{ span: { line: number } }>;
}

/**
 * Spawn oxlint and parse its JSON report.
 *
 * @param workingDirectory - The directory to lint.
 * @returns The raw diagnostics, plus the run details used in error messages.
 * @throws {Error} When oxlint cannot run, or emits output that is not JSON.
 */
/** One oxlint run: its diagnostics, plus the details error messages quote. */
interface OxlintRun {
	diagnostics: Array<unknown>;
	runContext: string;
	stdout: string;
}

/**
 * The oxlint binary in this repo's `node_modules`. Exported so specs that
 * spawn oxlint directly do not each re-derive the Windows `.CMD` suffix.
 *
 * @returns The absolute path to the binary.
 */
export function oxlintBinary(): string {
	return path.join(PROJECT_ROOT, "node_modules", ".bin", isWindows ? "oxlint.CMD" : "oxlint");
}

/**
 * Run the oxlint binary and return the normalized, sorted diagnostics.
 *
 * Oxlint exits 1 when diagnostics are found; anything else (spawn error,
 * config parse failure, crash, empty output) fails loudly instead of
 * masquerading as "no diagnostics". The JSON reporter is used because the
 * default (text) reporter output depends on the environment.
 *
 * @param workingDirectory - The directory to lint.
 * @param allowEmpty - Accept an empty report, for a caller whose assertion is
 *   that a rule set is inert.
 * @returns Diagnostics as sorted `file:line code` strings.
 * @throws {Error} When oxlint cannot run, or reports nothing unexpectedly.
 */
export function runOxlint(workingDirectory: string, allowEmpty = false): Array<string> {
	const { diagnostics: rawDiagnostics, runContext, stdout } = spawnOxlint(workingDirectory);

	const diagnostics = rawDiagnostics
		.filter(isOxlintDiagnostic)
		.map((diagnostic) => {
			const file = diagnostic.filename.replaceAll("\\", "/");
			const line = diagnostic.labels[0]?.span.line ?? 0;
			return `${file}:${line} ${diagnostic.code}`;
		})
		.sort();

	if (!allowEmpty && diagnostics.length === 0) {
		throw new Error(`oxlint produced no diagnostics: ${runContext}\n${stdout}`);
	}

	return diagnostics;
}

/**
 * Run oxlint with `--fix` over one file, for assertions about which
 * implementation of a rule produced the fix.
 *
 * @param workingDirectory - The directory holding the config and the file.
 * @param file - The file to fix, relative to that directory.
 * @throws {Error} When oxlint cannot run. Exit code 1 is a normal "found
 *   diagnostics" result and is not an error.
 */
export function runOxlintFix(workingDirectory: string, file: string): void {
	const result = spawnSync(
		oxlintBinary(),
		["-c", ".oxlintrc.json", "--disable-nested-config", "--fix", file],
		{
			cwd: workingDirectory,
			encoding: "utf8",
			shell: isWindows,
		},
	);

	if (result.error !== undefined || result.status === null || result.status > 1) {
		throw new Error(
			`oxlint --fix failed to run: status=${result.status}, ` +
				`error=${result.error?.message}, stderr=${result.stderr}`,
		);
	}
}

function spawnOxlint(workingDirectory: string): OxlintRun {
	const result = spawnSync(
		oxlintBinary(),
		["-c", ".oxlintrc.json", "--disable-nested-config", "-f", "json", "."],
		{
			cwd: workingDirectory,
			encoding: "utf8",
			shell: isWindows,
		},
	);

	const runContext = `status=${result.status}, error=${result.error?.message}, stderr=${result.stderr}`;

	if (result.error !== undefined || result.status === null || result.status > 1) {
		throw new Error(`oxlint failed to run: ${runContext}`);
	}

	// oxlint prints warnings such as "No files found to lint." to stdout, ahead
	// of the JSON report, so the payload starts at the first brace rather than
	// at the first character.
	const jsonStart = result.stdout.indexOf("{");

	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonStart === -1 ? result.stdout : result.stdout.slice(jsonStart));
	} catch {
		throw new Error(`Failed to parse oxlint JSON output. ${runContext}\n${result.stdout}`);
	}

	if (isRecord(parsed) && parsed["number_of_files"] === 0) {
		throw new Error(`oxlint found no files to lint: ${runContext}\n${result.stdout}`);
	}

	const diagnostics =
		isRecord(parsed) && Array.isArray(parsed["diagnostics"]) ? parsed["diagnostics"] : [];

	return { diagnostics, runContext, stdout: result.stdout };
}

/**
 * Whether a parsed value has the shape of an oxlint diagnostic.
 *
 * @param value - A candidate element from the parsed `diagnostics` array.
 * @returns Whether the value matches {@link OxlintDiagnostic}.
 */
function isOxlintDiagnostic(value: unknown): value is OxlintDiagnostic {
	return (
		isRecord(value) && typeof value["filename"] === "string" && Array.isArray(value["labels"])
	);
}
