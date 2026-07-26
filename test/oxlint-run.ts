import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { isRecord } from "../src/guards.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

const isWindows = os.platform() === "win32";

/** Spawning the binary is slow enough on Windows to need its own budget. */
export const OXLINT_TIMEOUT = isWindows ? 300_000 : 120_000;

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
 * Spawn oxlint and parse its JSON report.
 *
 * @param workingDirectory - The directory to lint.
 * @returns The raw diagnostics, plus the run details used in error messages.
 * @throws {Error} When oxlint cannot run, or emits output that is not JSON.
 */
function spawnOxlint(workingDirectory: string): {
	diagnostics: Array<unknown>;
	runContext: string;
	stdout: string;
} {
	const binaryName = isWindows ? "oxlint.CMD" : "oxlint";
	const binary = path.join(PROJECT_ROOT, "node_modules", ".bin", binaryName);

	const result: SpawnSyncReturns<string> = spawnSync(
		binary,
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

	let parsed: unknown;
	try {
		parsed = JSON.parse(result.stdout);
	} catch {
		throw new Error(`Failed to parse oxlint JSON output. ${runContext}\n${result.stdout}`);
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
