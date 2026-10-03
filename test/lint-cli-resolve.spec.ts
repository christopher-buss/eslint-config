import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";

import { CliError } from "../src/lint-cli/lib/cli/types.ts";
import { resolveLocalBin } from "../src/lint-cli/lib/exec/resolve.ts";

function temporaryDirectory(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-resolve-"));

	onTestFinished(() => {
		fs.rmSync(directory, { force: true, recursive: true });
	});

	return fs.realpathSync(directory);
}

function installPackage(root: string, name: string, packageJson: object): string {
	const directory = path.join(root, "node_modules", name);
	fs.mkdirSync(path.join(directory, "bin"), { recursive: true });
	fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify(packageJson));
	fs.writeFileSync(path.join(directory, "bin", `${name}.js`), "");
	return directory;
}

function installEslint(root: string): string {
	return installPackage(root, "eslint", { name: "eslint", bin: { eslint: "./bin/eslint.js" } });
}

function nestedDirectory(root: string): string {
	const nested = path.join(root, "nested");
	fs.mkdirSync(nested);
	return nested;
}

describe("resolveLocalBin", () => {
	it("prefers the nearest node_modules over an ancestor's", () => {
		expect.assertions(1);

		const root = temporaryDirectory();
		const nested = nestedDirectory(root);
		installEslint(root);
		const near = installEslint(nested);

		expect(resolveLocalBin("eslint", nested)).toBe(path.join(near, "bin", "eslint.js"));
	});

	it("falls back to an ancestor's node_modules", () => {
		expect.assertions(1);

		const root = temporaryDirectory();
		const nested = nestedDirectory(root);
		const far = installEslint(root);

		expect(resolveLocalBin("eslint", nested)).toBe(path.join(far, "bin", "eslint.js"));
	});

	it("resolves a string bin against the package root", () => {
		expect.assertions(1);

		const root = temporaryDirectory();
		const installed = installPackage(root, "oxlint", { name: "oxlint", bin: "bin/oxlint.js" });

		expect(resolveLocalBin("oxlint", root)).toBe(path.join(installed, "bin", "oxlint.js"));
	});

	it("reports a package it cannot find", () => {
		expect.assertions(1);

		const root = temporaryDirectory();

		expect(() => resolveLocalBin("eslint", root)).toThrow(CliError);
	});

	it("reports a package that declares no matching bin entry", () => {
		expect.assertions(1);

		const root = temporaryDirectory();
		installPackage(root, "eslint", { name: "eslint" });

		expect(() => resolveLocalBin("eslint", root)).toThrow(/does not declare/u);
	});

	it("reports a manifest it cannot parse rather than throwing a parse error", () => {
		expect.assertions(1);

		const root = temporaryDirectory();
		const installed = installPackage(root, "eslint", { name: "eslint" });
		fs.writeFileSync(path.join(installed, "package.json"), "{ truncated");

		expect(() => resolveLocalBin("eslint", root)).toThrow(CliError);
	});
});
