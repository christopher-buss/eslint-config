import { ESLint } from "eslint";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isentinel } from "../src/index.ts";
import { toPosix } from "../src/lint-cli/lib/paths.ts";

/**
 * Build a temporary project containing a `.claude` directory, and an ESLint
 * instance configured with the preset's ignores.
 *
 * @returns The project directory and an ESLint instance rooted at it.
 */
async function prepare(): Promise<{ eslint: ESLint; projectDirectory: string }> {
	const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "isentinel-ignores-"));

	await fs.mkdir(path.join(projectDirectory, ".claude", "commands"), { recursive: true });
	await fs.writeFile(path.join(projectDirectory, ".claude", "settings.json"), '{ "a": 1 }\n');
	await fs.writeFile(path.join(projectDirectory, ".claude", "other.json"), '{ "a": 1 }\n');
	await fs.writeFile(
		path.join(projectDirectory, ".claude", "commands", "settings.json"),
		'{ "a": 1 }\n',
	);

	const composer = await isentinel({
		name: "test/ignores",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		pnpm: false,
		spellCheck: false,
	});

	const eslint = new ESLint({
		cwd: projectDirectory,
		overrideConfig: [...composer],
		overrideConfigFile: true,
	});

	return { eslint, projectDirectory };
}

describe("ignores", () => {
	it("should not ignore .claude/settings.json", async () => {
		expect.hasAssertions();

		const { eslint, projectDirectory } = await prepare();

		await expect(
			eslint.isPathIgnored(path.join(projectDirectory, ".claude", "settings.json")),
		).resolves.toBe(false);
	});

	it("should still ignore other .claude files", async () => {
		expect.hasAssertions();

		const { eslint, projectDirectory } = await prepare();

		await expect(
			eslint.isPathIgnored(path.join(projectDirectory, ".claude", "other.json")),
		).resolves.toBe(true);
		await expect(
			eslint.isPathIgnored(
				path.join(projectDirectory, ".claude", "commands", "settings.json"),
			),
		).resolves.toBe(true);
	});

	it("should lint .claude/settings.json when linting the directory", async () => {
		expect.hasAssertions();

		const { eslint, projectDirectory } = await prepare();
		const results = await eslint.lintFiles(".");
		const linted = results
			.map((result) => toPosix(path.relative(projectDirectory, result.filePath)))
			.filter((file) => file.startsWith(".claude/"));

		expect(linted).toStrictEqual([".claude/settings.json"]);
	});
});
