import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { OnTestFinishedHandler } from "vitest";
import { describe, it, vi } from "vitest";

import { gitignore } from "../src/eslint/configs/gitignore.ts";
import { oxlintGitignore } from "../src/oxlint/configs/gitignore.ts";

/**
 * Build a temporary repo with a root `.gitignore`, a `.git/info/exclude` and a
 * nested package, and point `process.cwd()` at that package.
 *
 * @param files - Ignore file contents.
 * @param files.exclude - Content of `.git/info/exclude`.
 * @param files.gitignore - Content of the root `.gitignore`.
 * @param onTestFinished - Registers the cleanup.
 */
function prepareMonorepo(
	files: { exclude: string; gitignore: string },
	onTestFinished: (handler: OnTestFinishedHandler) => void,
): void {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "isentinel-gitignore-"));
	const packageDirectory = path.join(root, "packages", "app");

	fs.mkdirSync(path.join(root, ".git", "info"), { recursive: true });
	fs.mkdirSync(packageDirectory, { recursive: true });
	fs.writeFileSync(path.join(root, ".gitignore"), files.gitignore);
	fs.writeFileSync(path.join(root, ".git", "info", "exclude"), files.exclude);

	vi.spyOn(process, "cwd").mockReturnValue(packageDirectory);
	onTestFinished(() => {
		vi.restoreAllMocks();
		fs.rmSync(root, { force: true, recursive: true });
	});
}

/**
 * Build a main checkout with `.git/info/exclude` and a linked worktree whose
 * `.git` is a file pointing at `.git/worktrees/wt`, and point `process.cwd()`
 * at the worktree.
 *
 * @param files - Ignore file contents.
 * @param files.exclude - Content of the shared `.git/info/exclude`.
 * @param files.gitignore - Content of the worktree's `.gitignore`.
 * @param onTestFinished - Registers the cleanup.
 */
function prepareWorktree(
	files: { exclude: string; gitignore: string },
	onTestFinished: (handler: OnTestFinishedHandler) => void,
): void {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "isentinel-gitignore-"));
	const commonDirectory = path.join(root, "main", ".git");
	const worktreeGitDirectory = path.join(commonDirectory, "worktrees", "wt");
	const worktree = path.join(root, "wt");

	fs.mkdirSync(path.join(commonDirectory, "info"), { recursive: true });
	fs.mkdirSync(worktreeGitDirectory, { recursive: true });
	fs.mkdirSync(worktree, { recursive: true });
	fs.writeFileSync(path.join(commonDirectory, "info", "exclude"), files.exclude);
	fs.writeFileSync(path.join(worktreeGitDirectory, "commondir"), "../..\n");
	fs.writeFileSync(path.join(worktree, ".git"), `gitdir: ${worktreeGitDirectory}\n`);
	fs.writeFileSync(path.join(worktree, ".gitignore"), files.gitignore);

	vi.spyOn(process, "cwd").mockReturnValue(worktree);
	onTestFinished(() => {
		vi.restoreAllMocks();
		fs.rmSync(root, { force: true, recursive: true });
	});
}

describe("gitignore in a linked worktree", () => {
	it("should read info/exclude from the shared git directory", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		prepareWorktree({ exclude: "/ignored-dir/\n", gitignore: "*.log\n" }, onTestFinished);

		const [config] = await gitignore();

		expect(config).toStrictEqual({
			name: "isentinel/gitignore",
			ignores: ["ignored-dir/", "**/*.log"],
		});
	});

	it("should give oxlint the shared info/exclude patterns", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		prepareWorktree({ exclude: "/ignored-dir/\n", gitignore: "*.log\n" }, onTestFinished);

		expect(oxlintGitignore()).toStrictEqual(["*.log", "/ignored-dir/"]);
	});
});

describe("gitignore", () => {
	it("should read .git/info/exclude from a nested package without throwing", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		prepareMonorepo({ exclude: "*.tmp\n", gitignore: "*.log\n" }, onTestFinished);

		const [config] = await gitignore();

		expect(config).toStrictEqual({
			name: "isentinel/gitignore",
			ignores: ["**/*.tmp", "**/*.log"],
		});
	});

	it("should put .gitignore patterns after .git/info/exclude so they take precedence", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		prepareMonorepo({ exclude: "*.log\n", gitignore: "!keep.log\n" }, onTestFinished);

		const [config] = await gitignore();

		expect(config).toStrictEqual({
			name: "isentinel/gitignore",
			ignores: ["**/*.log", "!**/keep.log"],
		});
	});
});
