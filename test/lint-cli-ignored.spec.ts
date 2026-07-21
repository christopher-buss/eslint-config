// cspell:words unconfigured
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { normalizePath } from "../src/lint-cli/cache.ts";
import type { IgnoredPayload } from "../src/lint-cli/ignored-predicate.ts";
import { ignoredStatePath, resolveIgnoredFiles } from "../src/lint-cli/ignored.ts";
import { readState } from "../src/lint-cli/state.ts";

/** The config-variant key these fixtures store their ignore set under. */
const KEY = "ignored-test";

/** The config hash these fixtures memoise against; its value never matters. */
const HASH = "config-hash";

/**
 * A config whose ignore patterns are plain globs, so the helper can hand the
 * runner the patterns themselves. `.mjs` so ESLint loads it without a
 * TypeScript loader in the fixture's bare `node_modules`.
 */
const GLOB_CONFIG =
	'export default [{ files: ["**/*.{ts,mjs}"], rules: {} }, { ignores: ["generated/**"] }];\n';

/**
 * The same config with a *function* matcher, which cannot cross a process
 * boundary — the case that has to degrade to per-target answers.
 */
const FUNCTION_CONFIG =
	'export default [{ files: ["**/*.{ts,mjs}"], rules: {} }, ' +
	"{ ignores: [filePath => filePath.endsWith('.generated.ts')] }];\n";

function withFixture(config: string, run: (directory: string) => void): void {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-ignored-"));

	try {
		fs.writeFileSync(path.join(directory, "eslint.config.mjs"), config);
		fs.mkdirSync(path.join(directory, "src"));
		fs.writeFileSync(path.join(directory, "src/a.ts"), "export const a = 1;\n");
		run(fs.realpathSync(directory));
	} finally {
		fs.rmSync(directory, { force: true, recursive: true });
	}
}

function resolve(directory: string, targets: Array<string>, mutate: boolean): ReadonlySet<string> {
	return resolveIgnoredFiles({
		key: KEY,
		configHash: HASH,
		cwd: directory,
		mutate,
		targets: targets.map((target) => path.join(directory, target)),
	});
}

function has(ignored: ReadonlySet<string>, directory: string, relative: string): boolean {
	return ignored.has(normalizePath(path.join(directory, relative)));
}

function storedMode(directory: string): string | undefined {
	return readState<{ payload: IgnoredPayload }>(ignoredStatePath(directory, KEY))?.payload.mode;
}

describe("resolveIgnoredFiles", () => {
	it("classifies files added after the set was stored, without re-spawning", () => {
		expect.hasAssertions();

		withFixture(GLOB_CONFIG, (directory) => {
			const first = resolve(directory, ["src/a.ts"], true);

			expect(has(first, directory, "src/a.ts")).toBe(false);
			expect(storedMode(directory)).toBe("predicate");

			// Read-only mode never spawns the helper, so anything classified here
			// came from the stored patterns — including a path that did not exist
			// when they were stored.
			const second = resolve(directory, ["src/a.ts", "generated/b.ts"], false);

			expect(has(second, directory, "generated/b.ts")).toBe(true);
			expect(has(second, directory, "src/a.ts")).toBe(false);
		});
	});

	it("treats a file no config matches as ignored", () => {
		expect.hasAssertions();

		withFixture(GLOB_CONFIG, (directory) => {
			// `getConfigStatus` calls this "unconfigured" rather than "ignored",
			// but ESLint declines to lint it either way, so it must not count as
			// dirty.
			const ignored = resolve(directory, ["src/a.ts", "notes.txt"], true);

			expect(has(ignored, directory, "notes.txt")).toBe(true);
		});
	});

	it("falls back to per-target answers when a matcher is a function", () => {
		expect.hasAssertions();

		withFixture(FUNCTION_CONFIG, (directory) => {
			const ignored = resolve(directory, ["src/a.ts", "src/b.generated.ts"], true);

			expect(storedMode(directory)).toBe("answers");
			expect(has(ignored, directory, "src/b.generated.ts")).toBe(true);
			expect(has(ignored, directory, "src/a.ts")).toBe(false);
		});
	});

	it("reports nothing when the stored hash does not match and the run may not mutate", () => {
		expect.hasAssertions();

		withFixture(GLOB_CONFIG, (directory) => {
			const ignored = resolve(directory, ["generated/b.ts"], false);

			expect(ignored.size).toBe(0);
			expect(storedMode(directory)).toBeUndefined();
		});
	});
});
