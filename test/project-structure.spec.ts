import { ESLint } from "eslint";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ProjectStructureConfig } from "../src/eslint/types.ts";
import { isentinel } from "../src/index.ts";
import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import { OXLINT_FIXTURES_TEMP, runOxlint, OXLINT_TIMEOUT as timeout } from "./oxlint-run.ts";

const RULE = "project-structure/folder-structure";

type StructureOptions = Omit<ProjectStructureConfig, "projectRoot">;

interface StructureCase {
	name: string;
	expected: Array<string>;
	files: Record<string, string>;
	options?: StructureOptions;
}

const SOURCE = "export const value = 1;\n";

/**
 * One fixture tree per behaviour, shared by both engines.
 *
 * `folder-structure` runs natively in ESLint and as a jsPlugin in oxlint from
 * the same options, so every case is asserted twice: a divergence is a bug in
 * one of the two factories, not a difference the plugin knows about.
 */
const CASES: Array<StructureCase> = [
	{
		name: "reports a source file with no co-located spec",
		expected: ["src/value.ts"],
		files: { "src/value.ts": SOURCE },
	},
	{
		name: "accepts a source file whose spec sits beside it",
		expected: [],
		files: { "src/value.spec.ts": SOURCE, "src/value.ts": SOURCE },
	},
	{
		name: "keeps the kebab-case name of the source file",
		expected: [],
		files: { "src/package-json.spec.ts": SOURCE, "src/package-json.ts": SOURCE },
	},
	{
		name: "expands {ext} to the extension of the file it matched",
		expected: ["src/widget.tsx"],
		files: {
			"src/panel.spec.tsx": SOURCE,
			"src/panel.tsx": SOURCE,
			"src/widget.spec.ts": SOURCE,
			"src/widget.tsx": SOURCE,
		},
	},
	{
		name: "checks files at any depth",
		expected: ["src/a/b/c/deep.ts"],
		files: { "src/a/b/c/deep.ts": SOURCE },
	},
	{
		name: "exempts declaration files and build configs by default",
		expected: [],
		files: { "src/globals.d.ts": SOURCE, "tsdown.config.ts": SOURCE },
	},
	{
		name: "moves the exemption with a custom enforceExistence",
		expected: [],
		files: { "src/value.test.ts": SOURCE, "src/value.ts": SOURCE },
		options: { enforceExistence: "{node-name}.test.{ext}" },
	},
	{
		name: "supports a test file in a sibling folder",
		expected: [],
		files: { "src/__tests__/value.spec.ts": SOURCE, "src/value.ts": SOURCE },
		options: { enforceExistence: "__tests__/{node-name}.spec.{ext}" },
	},
	{
		name: "exempts a sibling-folder target the test globs do not cover",
		expected: [],
		files: { "src/checks/value.ts": SOURCE, "src/value.ts": SOURCE },
		options: { enforceExistence: "checks/{node-name}.{ext}" },
	},
	{
		name: "restricts the check to structureRoot",
		expected: ["src/value.ts"],
		files: { "scripts/build.ts": SOURCE, "src/value.ts": SOURCE },
		options: { structureRoot: "src" },
	},
];

/**
 * Write a project tree under a fresh directory.
 *
 * @param root - The directory to create the tree in.
 * @param files - File contents keyed by path relative to that directory.
 */
async function writeTree(root: string, files: Record<string, string>): Promise<void> {
	for (const [file, contents] of Object.entries(files)) {
		const target = path.join(root, file);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, contents);
	}
}

/**
 * Lint a project tree with the preset's `projectStructure` config under ESLint.
 *
 * @param files - File contents keyed by path relative to the project root.
 * @param options - Sub-options for the `projectStructure` config.
 * @returns The relative paths that `folder-structure` reported, sorted.
 */
async function lint(
	files: Record<string, string>,
	options: StructureOptions = {},
): Promise<Array<string>> {
	const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "isentinel-structure-"));
	await writeTree(projectDirectory, files);

	const composer = await isentinel({
		name: "test/project-structure",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		pnpm: false,
		projectStructure: { ...options, projectRoot: projectDirectory },
		spellCheck: false,
		// The project service resolves against the runner's cwd, so every
		// fixture file would otherwise be a fatal parse error and no rule at
		// all would run.
		typescript: { typeAware: false },
	});

	const eslint = new ESLint({
		cwd: projectDirectory,
		overrideConfig: [...composer],
		overrideConfigFile: true,
	});

	const results = await eslint.lintFiles(["**/*.{ts,tsx}"]);

	return results
		.filter((result) => result.messages.some((message) => message.ruleId === RULE))
		.map((result) => path.relative(projectDirectory, result.filePath).replaceAll("\\", "/"))
		.sort();
}

/**
 * Lint a project tree with the same config through the oxlint binary, which
 * runs the rule as a jsPlugin.
 *
 * @param name - A directory name for the run.
 * @param files - File contents keyed by path relative to the project root.
 * @param options - Sub-options for the `projectStructure` config.
 * @returns The relative paths that `folder-structure` reported, sorted.
 */
async function lintWithOxlint(
	name: string,
	files: Record<string, string>,
	options: StructureOptions = {},
): Promise<Array<string>> {
	const projectDirectory = path.resolve(OXLINT_FIXTURES_TEMP, name);
	await fs.rm(projectDirectory, { force: true, recursive: true });
	await writeTree(projectDirectory, files);

	const config = oxlintIsentinel({
		name: "test/project-structure",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		// tsgolint is installed here, so the typed pass would otherwise look
		// for a tsconfig the fixture tree does not have.
		options: { typeAware: false },
		projectStructure: { ...options, projectRoot: projectDirectory },
		spellCheck: false,
	});

	await fs.writeFile(
		path.join(projectDirectory, ".oxlintrc.json"),
		JSON.stringify(config, undefined, "\t"),
	);

	// The tree is lint-clean for `folder-structure` in most cases, and the
	// preset's other rules are noise here.
	const diagnostics = runOxlint(projectDirectory, true);
	await fs.rm(projectDirectory, { force: true, recursive: true });

	return [
		...new Set(
			diagnostics
				.filter((diagnostic) => diagnostic.includes("folder-structure"))
				.map((diagnostic) => diagnostic.replace(/:\d+ .*$/, "")),
		),
	].sort();
}

describe("projectStructure", () => {
	it.for(CASES)("$name", async (structureCase) => {
		expect.assertions(1);

		await expect(lint(structureCase.files, structureCase.options)).resolves.toStrictEqual(
			structureCase.expected,
		);
	});
});

describe("oxlintProjectStructure", () => {
	it.for(CASES)("$name", { timeout }, async (structureCase) => {
		expect.assertions(1);

		const directory = `project-structure-${structureCase.name.replaceAll(/\W+/g, "-")}`;

		await expect(
			lintWithOxlint(directory, structureCase.files, structureCase.options),
		).resolves.toStrictEqual(structureCase.expected);
	});
});
