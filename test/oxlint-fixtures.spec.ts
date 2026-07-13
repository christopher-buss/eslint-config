import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { isentinel as oxlintIsentinel } from "../src/oxlint";
import { FIXTURES_TEMP } from "./helpers";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURES_INPUT = path.resolve(PROJECT_ROOT, "fixtures", "input");

const isWindows = os.platform() === "win32";
const timeout = isWindows ? 300_000 : 120_000;

interface OxlintDiagnostic {
	code: string;
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
 * @returns Diagnostics as sorted `file:line code` strings.
 */
function runOxlint(workingDirectory: string): Array<string> {
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

	let parsed: { diagnostics: Array<OxlintDiagnostic> };
	try {
		parsed = JSON.parse(result.stdout) as { diagnostics: Array<OxlintDiagnostic> };
	} catch {
		throw new Error(`Failed to parse oxlint JSON output. ${runContext}\n${result.stdout}`);
	}

	const diagnostics = parsed.diagnostics
		.map((diagnostic) => {
			const file = diagnostic.filename.replaceAll("\\", "/");
			const line = diagnostic.labels[0]?.span.line ?? 0;
			return `${file}:${line} ${diagnostic.code}`;
		})
		.sort();

	if (diagnostics.length === 0) {
		throw new Error(`oxlint produced no diagnostics: ${runContext}\n${result.stdout}`);
	}

	return diagnostics;
}

describe("oxlint standalone fixtures", () => {
	it(
		"should produce the expected diagnostics",
		async ({ expect }) => {
			expect.hasAssertions();

			const temporaryDirectory = path.resolve(FIXTURES_TEMP, "oxlint-standalone");
			await fs.cp(FIXTURES_INPUT, temporaryDirectory, { recursive: true });

			const config = oxlintIsentinel({
				name: "test/oxlint-fixtures",
				gitignore: false,
				isAgent: false,
				isInEditor: false,
				spellCheck: false,
			});

			const configPath = path.join(temporaryDirectory, ".oxlintrc.json");
			await fs.writeFile(configPath, JSON.stringify(config, undefined, "\t"));

			const diagnostics = runOxlint(temporaryDirectory);

			expect(diagnostics).toMatchSnapshot();

			await fs.rm(temporaryDirectory, { force: true, recursive: true });
		},
		timeout,
	);

	it(
		"should run the cspell jsPlugin end-to-end",
		async ({ expect }) => {
			expect.hasAssertions();

			const temporaryDirectory = path.resolve(FIXTURES_TEMP, "oxlint-spellcheck");
			await fs.mkdir(temporaryDirectory, { recursive: true });
			await fs.writeFile(
				path.join(temporaryDirectory, "input.ts"),
				// oxlint-disable-next-line @cspell/spellchecker -- deliberate misspellings
				'export const RECIEVE_MESAGE = "definately wrogn";\n',
			);

			const config = oxlintIsentinel({
				name: "test/oxlint-spellcheck",
				gitignore: false,
				isAgent: false,
				isInEditor: false,
			});

			const configPath = path.join(temporaryDirectory, ".oxlintrc.json");
			await fs.writeFile(configPath, JSON.stringify(config, undefined, "\t"));

			const diagnostics = runOxlint(temporaryDirectory);

			expect(diagnostics.some((diagnostic) => diagnostic.includes("spellchecker"))).toBe(
				true,
			);

			await fs.rm(temporaryDirectory, { force: true, recursive: true });
		},
		timeout,
	);
});
