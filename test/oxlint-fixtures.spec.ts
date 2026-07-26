import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";

import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import { FIXTURES_TEMP } from "./helpers.ts";
import { runOxlint, OXLINT_TIMEOUT as timeout } from "./oxlint-run.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURES_INPUT = path.resolve(PROJECT_ROOT, "fixtures", "input");

describe("oxlint standalone fixtures", () => {
	it(
		"should produce the expected diagnostics",
		async ({ expect }) => {
			expect.assertions(1);

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

			await fs.rm(temporaryDirectory, { force: true, recursive: true });

			expect(diagnostics).toMatchSnapshot();
		},
		timeout,
	);

	it(
		"should run the cspell jsPlugin end-to-end",
		async ({ expect }) => {
			expect.assertions(1);

			const temporaryDirectory = path.resolve(FIXTURES_TEMP, "oxlint-spellcheck");
			await fs.mkdir(temporaryDirectory, { recursive: true });
			await fs.writeFile(
				path.join(temporaryDirectory, "input.ts"),
				// eslint-disable-next-line @cspell/spellchecker -- deliberate misspellings
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

			await fs.rm(temporaryDirectory, { force: true, recursive: true });

			expect(diagnostics.some((diagnostic) => diagnostic.includes("spellchecker"))).toBe(
				true,
			);
		},
		timeout,
	);
});
