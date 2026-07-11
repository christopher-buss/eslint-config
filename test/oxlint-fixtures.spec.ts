import { execFileSync } from "node:child_process";
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

const DIAGNOSTIC_PATTERN = /^(?<file>\S+?):(?<line>\d+):\d+: \w+ (?<rule>[^\s:]+):/;

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

			const binaryName = isWindows ? "oxlint.CMD" : "oxlint";
			const binary = path.join(PROJECT_ROOT, "node_modules", ".bin", binaryName);

			let output = "";
			try {
				output = execFileSync(
					binary,
					["-c", ".oxlintrc.json", "--disable-nested-config", "."],
					{
						cwd: temporaryDirectory,
						encoding: "utf8",
						shell: isWindows,
					},
				);
			} catch (err) {
				// oxlint exits non-zero when diagnostics are found
				const failure = err as { stdout?: string };
				output = failure.stdout ?? "";
			}

			const diagnostics = output
				.split("\n")
				.map((line) => DIAGNOSTIC_PATTERN.exec(line.trim()))
				.filter((match) => match !== null)
				.map((match) => {
					const file = match.groups?.["file"]?.replaceAll("\\", "/") ?? "";
					return `${file}:${match.groups?.["line"]} ${match.groups?.["rule"]}`;
				})
				.sort();

			expect(diagnostics.length).toBeGreaterThan(0);
			expect(diagnostics).toMatchSnapshot();

			await fs.rm(temporaryDirectory, { force: true, recursive: true });
		},
		timeout,
	);
});
