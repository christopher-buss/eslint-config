// cspell:words worktrees
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "vitest";
import { describe, it } from "vitest";

import { isPackageInstalled, resolvePackageManifest } from "../src/resolve-package.ts";

function temporaryDirectory(onTestFinished: TestContext["onTestFinished"]): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-package-"));

	onTestFinished(() => {
		fs.rmSync(directory, { force: true, recursive: true });
	});

	return fs.realpathSync(directory);
}

function installPackage(root: string, name: string, packageJson: object = {}): string {
	const directory = path.join(root, "node_modules", name);
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(
		path.join(directory, "package.json"),
		JSON.stringify({ name, ...packageJson }),
	);
	return path.join(directory, "package.json");
}

/**
 * A worktree nested inside its own checkout, the layout where a filesystem walk
 * that treats `cwd` as a file starts one level too high.
 *
 * @param root - The parent checkout.
 * @returns The nested worktree directory.
 */
function nestedWorktree(root: string): string {
	const nested = path.join(root, ".claude", "worktrees", "feature");
	fs.mkdirSync(nested, { recursive: true });
	return nested;
}

describe(resolvePackageManifest, () => {
	it("prefers the nested worktree's copy over the parent checkout's", ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		const root = temporaryDirectory(onTestFinished);
		const nested = nestedWorktree(root);
		installPackage(root, "oxlint-tsgolint", { version: "1.0.0" });
		const near = installPackage(nested, "oxlint-tsgolint", { version: "2.0.0" });

		expect(resolvePackageManifest("oxlint-tsgolint", nested)).toBe(near);
	});

	it("falls back to an ancestor's node_modules", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const root = temporaryDirectory(onTestFinished);
		const nested = nestedWorktree(root);
		const far = installPackage(root, "oxfmt");

		expect(resolvePackageManifest("oxfmt", nested)).toBe(far);
	});

	it("finds a package whose exports map hides its manifest", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const root = temporaryDirectory(onTestFinished);
		const manifest = installPackage(root, "hidden", {
			exports: { ".": { import: "./index.mjs" } },
		});

		expect(resolvePackageManifest("hidden", root)).toBe(manifest);
	});

	it("returns undefined for a package that is not installed", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const root = temporaryDirectory(onTestFinished);

		expect(resolvePackageManifest("oxlint-tsgolint", root)).toBeUndefined();
	});
});

describe(isPackageInstalled, () => {
	it("reports only what resolves from the given directory", ({ expect, onTestFinished }) => {
		expect.assertions(2);

		const root = temporaryDirectory(onTestFinished);
		const nested = nestedWorktree(root);
		installPackage(nested, "tsrs");

		expect(isPackageInstalled("tsrs", nested)).toBe(true);
		expect(isPackageInstalled("tsrs", root)).toBe(false);
	});
});
