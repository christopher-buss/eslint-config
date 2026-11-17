import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { OnTestFinishedHandler } from "vitest";
import { describe, it, vi } from "vitest";

import { gitignore } from "../src/eslint/configs/gitignore.ts";

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
