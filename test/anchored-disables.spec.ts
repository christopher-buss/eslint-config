import path from "node:path";
import { describe, expect, it } from "vitest";

import { hasAncestorDirectoryAnchor, rebaseAncestorAnchor } from "../src/anchors.ts";
import { disables } from "../src/eslint/configs/disables.ts";
import { GLOB_SRC } from "../src/globs.ts";
import { oxlintDisables } from "../src/oxlint/configs/disables.ts";

const WORKSPACE_ROOT = path.join("D:", "workspace");
const ROOT_GLOBS = ["*", "packages/*/*"];

/**
 * Blocks whose relaxations are keyed on a directory name somewhere above the
 * linted file.
 *
 * @returns The ESLint disables blocks carrying an ancestor-directory anchor.
 */
function anchoredEslintBlocks(): Array<{ basePath?: string; name: string }> {
	return (
		disables({ root: ROOT_GLOBS, workspaceRoot: WORKSPACE_ROOT })
			// ESLint allows a nested array as one AND-matched entry, so flatten
			// before inspecting individual patterns.
			.filter((config) => {
				return (config.files ?? [])
					.flat()
					.some((pattern) => hasAncestorDirectoryAnchor(pattern));
			})
			.map((config) => ({ name: config.name ?? "<unnamed>", basePath: config.basePath }))
	);
}

/**
 * Resolves the oxlint disables blocks for a config in a given directory.
 *
 * A block is emitted as up to two fragments — native rules and jsPlugin rules —
 * that carry identical `files`, so the collapsed globs are deduplicated.
 *
 * @param configDirectory - The directory holding the notional consuming config.
 * @returns The blocks, keyed by name with the `/js-plugin` split collapsed.
 */
function oxlintBlocks(configDirectory?: string): Map<string, Array<string>> {
	const blocks = new Map<string, Array<string>>();
	const configs = oxlintDisables({
		configDirectory,
		root: ROOT_GLOBS,
		workspaceRoot: WORKSPACE_ROOT,
	});

	for (const config of configs) {
		const name = config.name.replace(/\/js-plugin$/, "");
		blocks.set(name, [...new Set([...(blocks.get(name) ?? []), ...config.files])]);
	}

	return blocks;
}

describe("ancestor-directory anchors", () => {
	it("flags directory anchors and ignores basename anchors", () => {
		expect.assertions(8);

		expect(hasAncestorDirectoryAnchor(`**/scripts/${GLOB_SRC}`)).toBe(true);
		expect(hasAncestorDirectoryAnchor("**/bin/**/*")).toBe(true);
		expect(hasAncestorDirectoryAnchor("**/.github/scripts/**/*")).toBe(true);

		expect(hasAncestorDirectoryAnchor(GLOB_SRC)).toBe(false);
		expect(hasAncestorDirectoryAnchor("**/*config.{,c,m}[jt]s{,x}")).toBe(false);
		expect(hasAncestorDirectoryAnchor("**/cli.{,c,m}[jt]s{,x}")).toBe(false);
		// `disables/root` relies on these staying unflagged: they are relative
		// by design, so a nested config resolving them against its own
		// directory is the intent, not a bug.
		expect(hasAncestorDirectoryAnchor("*")).toBe(false);
		expect(hasAncestorDirectoryAnchor("packages/*/*")).toBe(false);
	});

	it("keeps the original pattern and adds a stripped variant when satisfied", () => {
		expect.assertions(2);

		expect(rebaseAncestorAnchor(`**/scripts/${GLOB_SRC}`, "scripts")).toStrictEqual([
			`**/scripts/${GLOB_SRC}`,
			GLOB_SRC,
		]);
		expect(rebaseAncestorAnchor(`**/tools/${GLOB_SRC}`, "tools/bundler")).toStrictEqual([
			`**/tools/${GLOB_SRC}`,
			GLOB_SRC,
		]);
	});

	it("leaves a pattern alone when the config path does not satisfy the anchor", () => {
		expect.assertions(1);

		expect(rebaseAncestorAnchor(`**/scripts/${GLOB_SRC}`, "tools/bundler")).toStrictEqual([
			`**/scripts/${GLOB_SRC}`,
		]);
	});

	it("honours a partial anchor only at the tail of the config path", () => {
		expect.assertions(2);

		expect(rebaseAncestorAnchor("**/.github/scripts/**/*", ".github")).toStrictEqual([
			"**/.github/scripts/**/*",
			"scripts/**/*",
		]);
		// `.github/foo` cannot satisfy `.github/scripts`, so nothing beneath it
		// should be relaxed.
		expect(rebaseAncestorAnchor("**/.github/scripts/**/*", ".github/foo")).toStrictEqual([
			"**/.github/scripts/**/*",
		]);
	});
});

describe("anchored disables stay mitigated", () => {
	it("pins every ancestor-anchored ESLint block to the workspace root", () => {
		expect.assertions(1);

		const unpinned = anchoredEslintBlocks()
			.filter((block) => block.basePath !== WORKSPACE_ROOT)
			.map((block) => block.name);

		// ESLint 10 resolves the config nearest each linted file, so without a
		// pinned basePath these blocks are silently dead in every project that
		// has its own eslint.config.*.
		expect(unpinned).toStrictEqual([]);
	});

	it("covers the blocks that are known to be anchored", () => {
		expect.assertions(1);

		expect(anchoredEslintBlocks().map((block) => block.name)).toStrictEqual([
			"isentinel/disables/scripts",
			"isentinel/disables/cli",
			"isentinel/disables/build-tools",
			"isentinel/disables/bin",
			"isentinel/disables/test",
		]);
	});

	it("leaves disables/root unpinned", () => {
		expect.assertions(1);

		const root = disables({ root: ROOT_GLOBS, workspaceRoot: WORKSPACE_ROOT }).find(
			(config) => config.name === "isentinel/disables/root",
		);

		// Pinning this one would stop it matching each project's own top-level
		// files, firing import/no-default-export on every nested config file.
		expect(root!.basePath).toBeUndefined();
	});

	it("mirrors every anchored block on the oxlint side", () => {
		expect.assertions(1);

		const oxlintNames = new Set(oxlintBlocks().keys());
		const missing = anchoredEslintBlocks()
			.map((block) => block.name)
			.filter((name) => !oxlintNames.has(name));

		expect(missing).toStrictEqual([]);
	});
});

describe("oxlint anchor rebasing", () => {
	it("widens anchored globs for a config inside the anchored directory", () => {
		expect.assertions(2);

		const files = oxlintBlocks(path.join(WORKSPACE_ROOT, "scripts")).get(
			"isentinel/disables/scripts",
		);

		expect(files).toContain(`**/scripts/${GLOB_SRC}`);
		expect(files).toContain(GLOB_SRC);
	});

	it("widens anchored globs from a nested project directory", () => {
		expect.assertions(1);

		const files = oxlintBlocks(path.join(WORKSPACE_ROOT, "tools", "bundler")).get(
			"isentinel/disables/build-tools",
		);

		expect(files).toContain(GLOB_SRC);
	});

	it("leaves globs untouched without a configDirectory", () => {
		expect.assertions(1);

		expect(oxlintBlocks().get("isentinel/disables/scripts")).toStrictEqual([
			`**/scripts/${GLOB_SRC}`,
		]);
	});

	it("leaves globs untouched for a config at the workspace root", () => {
		expect.assertions(1);

		expect(oxlintBlocks(WORKSPACE_ROOT).get("isentinel/disables/scripts")).toStrictEqual([
			`**/scripts/${GLOB_SRC}`,
		]);
	});

	it("does not widen an unrelated block", () => {
		expect.assertions(1);

		expect(
			oxlintBlocks(path.join(WORKSPACE_ROOT, "scripts")).get("isentinel/disables/cli"),
		).toStrictEqual([`**/cli/${GLOB_SRC}`, "**/cli.{,c,m}[jt]s{,x}"]);
	});
});
