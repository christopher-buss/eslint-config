import { ESLint } from "eslint";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ProjectStructureConfig } from "../src/eslint/types.ts";
import { isentinel } from "../src/index.ts";

const RULE = "project-structure/folder-structure";

/**
 * Write a project tree under a fresh temporary directory and lint it with the
 * preset's `projectStructure` config.
 *
 * @param files - File contents keyed by path relative to the project root.
 * @param options - Sub-options for the `projectStructure` config.
 * @returns The relative paths that `folder-structure` reported, sorted.
 */
async function lint(
	files: Record<string, string>,
	options: Omit<ProjectStructureConfig, "projectRoot"> = {},
): Promise<Array<string>> {
	const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "isentinel-structure-"));

	for (const [file, contents] of Object.entries(files)) {
		const target = path.join(projectDirectory, file);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, contents);
	}

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

const SOURCE = "export const value = 1;\n";

describe("projectStructure", () => {
	it("reports a source file with no co-located spec", async () => {
		expect.assertions(1);

		await expect(lint({ "src/value.ts": SOURCE })).resolves.toStrictEqual(["src/value.ts"]);
	});

	it("accepts a source file whose spec sits beside it", async () => {
		expect.assertions(1);

		await expect(
			lint({ "src/value.spec.ts": SOURCE, "src/value.ts": SOURCE }),
		).resolves.toStrictEqual([]);
	});

	it("keeps the kebab-case name of the source file", async () => {
		expect.assertions(1);

		await expect(
			lint({ "src/package-json.spec.ts": SOURCE, "src/package-json.ts": SOURCE }),
		).resolves.toStrictEqual([]);
	});

	it("expands {ext} to the extension of the file it matched", async () => {
		expect.assertions(1);

		await expect(
			lint({
				"src/panel.spec.tsx": SOURCE,
				"src/panel.tsx": SOURCE,
				"src/widget.spec.ts": SOURCE,
				"src/widget.tsx": SOURCE,
			}),
		).resolves.toStrictEqual(["src/widget.tsx"]);
	});

	it("checks files at any depth", async () => {
		expect.assertions(1);

		await expect(lint({ "src/a/b/c/deep.ts": SOURCE })).resolves.toStrictEqual([
			"src/a/b/c/deep.ts",
		]);
	});

	it("exempts declaration files and build configs by default", async () => {
		expect.assertions(1);

		await expect(
			lint({ "src/globals.d.ts": SOURCE, "tsdown.config.ts": SOURCE }),
		).resolves.toStrictEqual([]);
	});

	it("moves the exemption with a custom enforceExistence", async () => {
		expect.assertions(1);

		await expect(
			lint(
				{ "src/value.test.ts": SOURCE, "src/value.ts": SOURCE },
				{ enforceExistence: "{node-name}.test.{ext}" },
			),
		).resolves.toStrictEqual([]);
	});

	it("supports a test file in a sibling folder", async () => {
		expect.assertions(1);

		await expect(
			lint(
				{ "src/__tests__/value.spec.ts": SOURCE, "src/value.ts": SOURCE },
				{ enforceExistence: "__tests__/{node-name}.spec.{ext}" },
			),
		).resolves.toStrictEqual([]);
	});

	it("restricts the check to structureRoot", async () => {
		expect.assertions(1);

		await expect(
			lint({ "scripts/build.ts": SOURCE, "src/value.ts": SOURCE }, { structureRoot: "src" }),
		).resolves.toStrictEqual(["src/value.ts"]);
	});
});
