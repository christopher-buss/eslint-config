import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { OnTestFinishedHandler } from "vitest";
import { describe, it, vi } from "vitest";

import { gitignore } from "../src/eslint/configs/gitignore.ts";
import { oxlintGitignore } from "../src/oxlint/configs/gitignore.ts";

type OnFinished = (handler: OnTestFinishedHandler) => void;

interface WorktreeFiles {
	exclude: string;
	/** Content of the worktree's `.git` file, given its git directory. */
	gitFile?: (gitDirectory: string) => string;
	/** Content of the worktree's `.gitignore`; omitted means no file. */
	gitignore?: string;
}

/**
 * Make a temporary directory, removed with the mocks when the test finishes.
 *
 * @param onTestFinished - Registers the cleanup.
 * @returns The new directory.
 */
function makeTemporaryRoot(onTestFinished: OnFinished): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "isentinel-gitignore-"));
	onTestFinished(() => {
		vi.restoreAllMocks();
		fs.rmSync(root, { force: true, recursive: true });
	});
	return root;
}

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
	onTestFinished: OnFinished,
): void {
	const root = makeTemporaryRoot(onTestFinished);
	const packageDirectory = path.join(root, "packages", "app");

	fs.mkdirSync(path.join(root, ".git", "info"), { recursive: true });
	fs.mkdirSync(packageDirectory, { recursive: true });
	fs.writeFileSync(path.join(root, ".gitignore"), files.gitignore);
	fs.writeFileSync(path.join(root, ".git", "info", "exclude"), files.exclude);

	vi.spyOn(process, "cwd").mockReturnValue(packageDirectory);
}

/**
 * Build a main checkout with `.git/info/exclude` and a linked worktree whose
 * `.git` is a file pointing at `.git/worktrees/wt`, and point `process.cwd()`
 * at the worktree.
 *
 * @param files - Ignore file contents.
 * @param onTestFinished - Registers the cleanup.
 */
function prepareWorktree(files: WorktreeFiles, onTestFinished: OnFinished): void {
	const root = makeTemporaryRoot(onTestFinished);
	const commonDirectory = path.join(root, "main", ".git");
	const worktreeGitDirectory = path.join(commonDirectory, "worktrees", "wt");
	const worktree = path.join(root, "wt");
	const gitFile = files.gitFile ?? ((directory) => `gitdir: ${directory}\n`);

	fs.mkdirSync(path.join(commonDirectory, "info"), { recursive: true });
	fs.mkdirSync(worktreeGitDirectory, { recursive: true });
	fs.mkdirSync(worktree, { recursive: true });
	fs.writeFileSync(path.join(commonDirectory, "info", "exclude"), files.exclude);
	fs.writeFileSync(path.join(worktreeGitDirectory, "commondir"), "../..\n");
	fs.writeFileSync(path.join(worktree, ".git"), gitFile(worktreeGitDirectory));
	if (files.gitignore !== undefined) {
		fs.writeFileSync(path.join(worktree, ".gitignore"), files.gitignore);
	}

	vi.spyOn(process, "cwd").mockReturnValue(worktree);
}

/**
 * Build a repo with a submodule whose `.git` file points at
 * `.git/modules/sub`, which has its own `info/exclude` and no `commondir`, and
 * point `process.cwd()` at the submodule.
 *
 * @param onTestFinished - Registers the cleanup.
 */
function prepareSubmodule(onTestFinished: OnFinished): void {
	const root = makeTemporaryRoot(onTestFinished);
	const moduleGitDirectory = path.join(root, ".git", "modules", "sub");
	const submodule = path.join(root, "sub");

	fs.mkdirSync(path.join(root, ".git", "info"), { recursive: true });
	fs.mkdirSync(path.join(moduleGitDirectory, "info"), { recursive: true });
	fs.mkdirSync(submodule, { recursive: true });
	fs.writeFileSync(path.join(root, ".git", "info", "exclude"), "parent-only/\n");
	fs.writeFileSync(path.join(moduleGitDirectory, "info", "exclude"), "submodule-only/\n");
	fs.writeFileSync(path.join(submodule, ".git"), "gitdir: ../.git/modules/sub\n");
	fs.writeFileSync(path.join(submodule, ".gitignore"), "*.log\n");

	vi.spyOn(process, "cwd").mockReturnValue(submodule);
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

	it("should follow a relative gitdir in a CRLF .git file", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		prepareWorktree(
			{
				exclude: "/ignored-dir/\n",
				gitFile: () => "gitdir: ../main/.git/worktrees/wt\r\n",
				gitignore: "*.log\n",
			},
			onTestFinished,
		);

		const [config] = await gitignore();

		expect(config!.ignores).toStrictEqual(["ignored-dir/", "**/*.log"]);
	});

	it("should skip info/exclude without a .gitignore, as the main checkout does", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		prepareWorktree({ exclude: "/ignored-dir/\n" }, onTestFinished);

		const [config] = await gitignore();

		expect(config!.ignores).toStrictEqual([]);
	});

	it("should read a submodule's own info/exclude", async ({ expect, onTestFinished }) => {
		expect.assertions(2);

		prepareSubmodule(onTestFinished);

		const [config] = await gitignore();

		expect(config!.ignores).toStrictEqual(["**/submodule-only/", "**/*.log"]);
		expect(oxlintGitignore()).toStrictEqual(["*.log", "submodule-only/"]);
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
