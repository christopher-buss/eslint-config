// cspell:words unconfigured
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { normalizePath } from "../src/lint-cli/cache.ts";
import type { RunContext } from "../src/lint-cli/context.ts";
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
 *
 * The third entry is the one that has to survive serialization intact:
 * `ignores` beside another key only excludes files from *that* config, so
 * `src/b.ts` is still linted. Carrying it over as a bare `{ignores}` would
 * silently promote it into a global ignore.
 */
const GLOB_CONFIG =
	'export default [{ files: ["**/*.{ts,mjs}"], rules: {} }, { ignores: ["generated/**"] }, ' +
	'{ ignores: ["src/b.ts"], rules: {} }];\n';

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

/**
 * A run against a fixture, pinned to {@link KEY}. Built literally rather than
 * through `resolveRunContext` so the variant key stays a fixed, readable name
 * instead of an environment-derived digest.
 *
 * @param directory - The fixture project root.
 * @param mutate - Whether the run may spawn the helper and write state.
 * @returns The run context.
 */
function runFor(directory: string, mutate: boolean): RunContext {
	return { key: KEY, ci: false, cwd: directory, environment: {}, mutate };
}

function resolve(directory: string, targets: Array<string>, mutate: boolean): ReadonlySet<string> {
	return resolveIgnoredFiles(
		runFor(directory, mutate),
		HASH,
		targets.map((target) => path.join(directory, target)),
	);
}

/**
 * Resolve the way a real run does: the helper may spawn, state may be written.
 *
 * @param directory - The fixture project root.
 * @param targets - Fixture-relative target paths.
 * @returns The ignored set.
 */
function resolveAndStore(directory: string, targets: Array<string>): ReadonlySet<string> {
	return resolve(directory, targets, true);
}

/**
 * Resolve the way `--print` does. This never spawns the helper and never
 * writes, so anything it classifies came from what is already stored.
 *
 * @param directory - The fixture project root.
 * @param targets - Fixture-relative target paths.
 * @returns The ignored set.
 */
function resolveReadOnly(directory: string, targets: Array<string>): ReadonlySet<string> {
	return resolve(directory, targets, false);
}

function has(ignored: ReadonlySet<string>, directory: string, relative: string): boolean {
	return ignored.has(normalizePath(path.join(directory, relative)));
}

function storedMode(directory: string): string | undefined {
	return readState<{ payload: IgnoredPayload }>(ignoredStatePath(runFor(directory, false)))
		?.payload.mode;
}

describe("resolveIgnoredFiles", () => {
	it("classifies files added after the set was stored, without re-spawning", () => {
		expect.hasAssertions();

		withFixture(GLOB_CONFIG, (directory) => {
			expect(has(resolveAndStore(directory, ["src/a.ts"]), directory, "src/a.ts")).toBe(
				false,
			);
			expect(storedMode(directory)).toBe("predicate");

			const second = resolveReadOnly(directory, ["src/a.ts", "generated/b.ts"]);

			expect(has(second, directory, "generated/b.ts")).toBe(true);
			expect(has(second, directory, "src/a.ts")).toBe(false);
		});
	});

	it("keeps a config's own ignores from becoming a global ignore", () => {
		expect.hasAssertions();

		withFixture(GLOB_CONFIG, (directory) => {
			// `src/b.ts` is ignored *by one config*, which only excludes it from
			// that config's rules. ESLint still lints it.
			const ignored = resolveAndStore(directory, ["src/a.ts", "src/b.ts"]);

			expect(has(ignored, directory, "src/b.ts")).toBe(false);
		});
	});

	it("treats a file no config matches as ignored", () => {
		expect.hasAssertions();

		withFixture(GLOB_CONFIG, (directory) => {
			// `getConfigStatus` calls this "unconfigured" rather than "ignored",
			// but ESLint declines to lint it either way, so it must not count as
			// dirty.
			const ignored = resolveAndStore(directory, ["src/a.ts", "notes.txt"]);

			expect(has(ignored, directory, "notes.txt")).toBe(true);
		});
	});

	it("falls back to per-target answers when a matcher is a function", () => {
		expect.hasAssertions();

		withFixture(FUNCTION_CONFIG, (directory) => {
			const ignored = resolveAndStore(directory, ["src/a.ts", "src/b.generated.ts"]);

			expect(storedMode(directory)).toBe("answers");
			expect(has(ignored, directory, "src/b.generated.ts")).toBe(true);
			expect(has(ignored, directory, "src/a.ts")).toBe(false);

			// The residual the answers payload keeps: a file it was never asked
			// about reads as not-ignored rather than being matched.
			const later = resolveReadOnly(directory, ["src/c.generated.ts"]);

			expect(has(later, directory, "src/c.generated.ts")).toBe(false);
		});
	});

	it("reports nothing when the stored hash does not match and the run may not mutate", () => {
		expect.hasAssertions();

		withFixture(GLOB_CONFIG, (directory) => {
			const ignored = resolveReadOnly(directory, ["generated/b.ts"]);

			expect(ignored.size).toBe(0);
			expect(storedMode(directory)).toBeUndefined();
		});
	});
});
