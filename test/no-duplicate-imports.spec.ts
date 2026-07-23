import type { Linter } from "eslint";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, onTestFinished } from "vitest";

import { isRecord } from "../src/guards.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const isWindows = os.platform() === "win32";

const RULE = "no-duplicate-imports";
const RULE_ENTRY: Linter.RuleEntry = ["error", { allowSeparateTypeImports: true }];

// import type + value from the same module: allowed by allowSeparateTypeImports.
const SPLIT_FIXTURE =
	"import type { A } from './m';\nimport { b } from './m';\nexport { b };\nexport type { A };\n";
// Two value imports from the same module: a real duplicate, must be flagged.
const DUPLICATE_FIXTURE = "import { a } from './n';\nimport { c } from './n';\nexport { a, c };\n";
const MODULE_FIXTURE =
	"export const a = 1;\nexport const b = 2;\nexport const c = 3;\nexport type A = number;\n";

/**
 * Lint the two fixtures with the oxlint binary and return the fixture files the
 * rule flagged.
 *
 * @param directory - Directory containing the fixtures and `.oxlintrc.json`.
 * @returns The flagged fixture file names.
 */
function runOxlint(directory: string): Array<string> {
	const binaryName = isWindows ? "oxlint.CMD" : "oxlint";
	const binary = path.join(PROJECT_ROOT, "node_modules", ".bin", binaryName);
	const result = spawnSync(
		binary,
		["-c", ".oxlintrc.json", "--disable-nested-config", "-f", "json", "split.ts", "dup.ts"],
		{ cwd: directory, encoding: "utf8", shell: isWindows },
	);

	if (result.status === null || result.status > 1) {
		throw new Error(`oxlint failed: status=${result.status}, stderr=${result.stderr}`);
	}

	const parsed: unknown = JSON.parse(result.stdout);
	const diagnostics =
		isRecord(parsed) && Array.isArray(parsed["diagnostics"]) ? parsed["diagnostics"] : [];
	return diagnostics
		.filter((diagnostic): diagnostic is { code: string; filename: string } => {
			return (
				isRecord(diagnostic) &&
				typeof diagnostic["code"] === "string" &&
				typeof diagnostic["filename"] === "string"
			);
		})
		.filter((diagnostic) => diagnostic.code === `eslint(${RULE})`)
		.map((diagnostic) => path.basename(diagnostic.filename));
}

/**
 * Lint the two fixtures with the ESLint API and return the fixture files the
 * rule flagged.
 *
 * @param directory - Directory containing the fixtures.
 * @returns The flagged fixture file names.
 */
async function runEslint(directory: string): Promise<Array<string>> {
	const { ESLint } = await import("eslint");
	const parser = await import("@typescript-eslint/parser");
	const eslint = new ESLint({
		cwd: directory,
		overrideConfig: [
			{
				files: ["**/*.ts"],
				languageOptions: { parser: parser.default },
				rules: { [RULE]: RULE_ENTRY },
			},
		],
		overrideConfigFile: true,
	});

	const results = await eslint.lintFiles(["split.ts", "dup.ts"]);
	const flagged: Array<string> = [];
	for (const result of results) {
		if (result.messages.some((message) => message.ruleId === RULE)) {
			flagged.push(path.basename(result.filePath));
		}
	}

	return flagged;
}

describe("no-duplicate-imports allowSeparateTypeImports parity", () => {
	it("allows split type/value imports and flags true duplicates on both engines", async ({
		expect,
	}) => {
		expect.assertions(3);

		const directory = await fs.mkdtemp(path.join(os.tmpdir(), "no-dup-imports-"));
		onTestFinished(async () => {
			await fs.rm(directory, { force: true, recursive: true });
		});

		await fs.writeFile(path.join(directory, "split.ts"), SPLIT_FIXTURE);
		await fs.writeFile(path.join(directory, "dup.ts"), DUPLICATE_FIXTURE);
		await fs.writeFile(path.join(directory, "m.ts"), MODULE_FIXTURE);
		await fs.writeFile(path.join(directory, "n.ts"), MODULE_FIXTURE);
		await fs.writeFile(
			path.join(directory, ".oxlintrc.json"),
			JSON.stringify({ categories: {}, plugins: [], rules: { [RULE]: RULE_ENTRY } }),
		);

		const oxlintFlagged = runOxlint(directory).sort();
		const eslintResults = await runEslint(directory);
		const eslintFlagged = eslintResults.sort();

		// The true duplicate is flagged; the split type/value import is not.
		expect(oxlintFlagged).toStrictEqual(["dup.ts"]);
		expect(eslintFlagged).toStrictEqual(["dup.ts"]);
		expect(oxlintFlagged).toStrictEqual(eslintFlagged);
	});
});
