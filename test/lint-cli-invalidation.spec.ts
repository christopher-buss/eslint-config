// cspell:words tsbuildinfo typeaware globals
import fileEntryCache from "file-entry-cache";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { computeAffectedFiles } from "../src/lint-cli/affected.ts";
import { normalizePath, removeCacheEntries } from "../src/lint-cli/cache.ts";
import { applyTypeAwareInvalidation } from "../src/lint-cli/invalidation.ts";

const TSCONFIG = JSON.stringify({
	compilerOptions: { module: "commonjs", strict: true, target: "es2020" },
	include: ["src"],
});

const DOM_TSCONFIG = JSON.stringify({
	compilerOptions: { lib: ["es2020", "dom"], module: "commonjs", strict: true, target: "es2020" },
	include: ["src"],
});

function withFixture(files: Record<string, string>, run: (directory: string) => void): void {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-fx-"));

	try {
		// A sibling `node_modules/typescript` junction lets the CLI resolve the
		// real typescript from the fixture cwd. Sources stay outside any
		// node_modules path: TS never reports node_modules files affected.
		const typescriptDirectory = path.dirname(
			createRequire(import.meta.url).resolve("typescript/package.json"),
		);
		fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
		fs.symlinkSync(
			fs.realpathSync(typescriptDirectory),
			path.join(root, "node_modules", "typescript"),
			"junction",
		);

		const directory = path.join(root, "project");
		for (const [relative, content] of Object.entries(files)) {
			const absolute = path.join(directory, relative);
			fs.mkdirSync(path.dirname(absolute), { recursive: true });
			fs.writeFileSync(absolute, content);
		}

		run(directory);
	} finally {
		fs.rmSync(root, { force: true, recursive: true });
	}
}

function seedCache(cacheFile: string, files: Array<string>): void {
	const cache = fileEntryCache.create(path.basename(cacheFile), path.dirname(cacheFile), false);
	for (const file of files) {
		cache.getFileDescriptor(file);
	}

	cache.reconcile();
}

function cacheHasEntry(cacheFile: string, file: string): boolean {
	if (!fs.existsSync(cacheFile)) {
		return false;
	}

	const cache = fileEntryCache.createFromFile(cacheFile, false);
	const target = normalizePath(file);
	return cache.cache.keys().some((key) => normalizePath(key) === target);
}

function touch(file: string): void {
	const future = Date.now() / 1000 + 60;
	fs.utimesSync(file, future, future);
}

function invalidate(
	cwd: string,
	targetFiles: Array<string>,
	alreadyDirty: ReadonlySet<string>,
	environment: NodeJS.ProcessEnv = {},
): ReturnType<typeof applyTypeAwareInvalidation> {
	return applyTypeAwareInvalidation({
		alreadyDirty,
		cacheLocation: path.join(cwd, ".eslintcache"),
		cwd,
		environment,
		mode: undefined,
		targetFiles,
	});
}

describe("computeAffectedFiles", () => {
	it("reports every file on the first run, then nothing when unchanged", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export function a(): number { return 1; }\n",
				"src/b.ts":
					"import { a } from './a';\nexport function b(): number { return a() + 1; }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const first = computeAffectedFiles(directory, undefined);

				expect(first?.firstRun).toBe(true);
				expect(first?.affected.size).toBeGreaterThan(0);

				const second = computeAffectedFiles(directory, undefined);

				expect(second?.firstRun).toBe(false);
				expect(second?.affected.size).toBe(0);
			},
		);
	});

	it("skips gracefully when no tsconfig is present", () => {
		expect.hasAssertions();

		withFixture({ "src/a.ts": "export const a = 1;\n" }, (directory) => {
			expect(computeAffectedFiles(directory, undefined)).toBeUndefined();
		});
	});
});

describe("applyTypeAwareInvalidation", () => {
	it("does not invalidate importers on an implementation-only edit", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export function a(): number { return 1; }\n",
				"src/b.ts":
					"import { a } from './a';\nexport function b(): number { return a() + 1; }\n",
				"src/c.ts":
					"import { b } from './b';\nexport function c(): number { return b() + 1; }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, ".eslintcache");
				const fileA = path.join(directory, "src/a.ts");
				const fileB = path.join(directory, "src/b.ts");
				const fileC = path.join(directory, "src/c.ts");
				computeAffectedFiles(directory, undefined);
				seedCache(cacheFile, [fileA, fileB, fileC]);
				fs.writeFileSync(fileA, "export function a(): number { return 42; }\n");
				touch(fileA);

				const dirty = new Set([normalizePath(fileA)]);
				const outcome = invalidate(directory, [fileA, fileB, fileC], dirty);

				expect(outcome.busted).toBe(false);
				expect(outcome.firstRun).toBe(false);
				expect(outcome.invalidated).toStrictEqual([]);
				expect(cacheHasEntry(cacheFile, fileB)).toBe(true);
				expect(cacheHasEntry(cacheFile, fileC)).toBe(true);
			},
		);
	});

	it("invalidates transitive importers on an exported-type change", () => {
		expect.hasAssertions();

		withFixture(
			{
				// Inferred return types so a's shape change propagates into c.
				"src/a.ts": "export function a() { return 1; }\n",
				"src/b.ts": "import { a } from './a';\nexport function b() { return a(); }\n",
				"src/c.ts": "import { b } from './b';\nexport function c() { return b(); }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, ".eslintcache");
				const fileA = path.join(directory, "src/a.ts");
				const fileB = path.join(directory, "src/b.ts");
				const fileC = path.join(directory, "src/c.ts");
				computeAffectedFiles(directory, undefined);
				seedCache(cacheFile, [fileA, fileB, fileC]);
				fs.writeFileSync(fileA, "export function a() { return 'now a string'; }\n");
				touch(fileA);

				const dirty = new Set([normalizePath(fileA)]);
				const outcome = invalidate(directory, [fileA, fileB, fileC], dirty);

				expect(outcome.busted).toBe(false);
				expect(outcome.invalidated).toContain(normalizePath(fileB));
				expect(outcome.invalidated).toContain(normalizePath(fileC));
				expect(cacheHasEntry(cacheFile, fileB)).toBe(false);
				expect(cacheHasEntry(cacheFile, fileC)).toBe(false);
			},
		);
	});

	it("invalidates everything on a global-augmentation edit", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export function a(): number { return 1; }\n",
				"src/b.ts":
					"import { a } from './a';\nexport function b(): number { return a() + 1; }\n",
				"src/globals.ts":
					"declare global { interface Window { foo: number; } }\nexport {};\n",
				"tsconfig.json": DOM_TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, ".eslintcache");
				const fileA = path.join(directory, "src/a.ts");
				const fileB = path.join(directory, "src/b.ts");
				const fileGlobals = path.join(directory, "src/globals.ts");
				computeAffectedFiles(directory, undefined);
				seedCache(cacheFile, [fileA, fileB, fileGlobals]);
				fs.writeFileSync(
					fileGlobals,
					"declare global { interface Window { foo: number; bar: string; } }\nexport {};\n",
				);
				touch(fileGlobals);

				const outcome = invalidate(
					directory,
					[fileA, fileB, fileGlobals],
					new Set([normalizePath(fileGlobals)]),
				);

				expect(outcome.busted).toBe(false);
				expect(outcome.invalidated).toContain(normalizePath(fileA));
				expect(outcome.invalidated).toContain(normalizePath(fileB));
				expect(cacheHasEntry(cacheFile, fileA)).toBe(false);
				expect(cacheHasEntry(cacheFile, fileB)).toBe(false);
			},
		);
	});

	it("deletes the whole cache file when the affected set exceeds the threshold", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export function a() { return 1; }\n",
				"src/b.ts": "import { a } from './a';\nexport function b() { return a(); }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, ".eslintcache");
				const fileA = path.join(directory, "src/a.ts");
				const fileB = path.join(directory, "src/b.ts");
				computeAffectedFiles(directory, undefined);
				seedCache(cacheFile, [fileA, fileB]);
				fs.writeFileSync(fileA, "export function a() { return 'string now'; }\n");
				touch(fileA);

				// Threshold 0: any affected file trips the escape valve.
				const dirty = new Set([normalizePath(fileA)]);
				const outcome = invalidate(directory, [fileA, fileB], dirty, {
					LINT_AFFECTED_BUST_THRESHOLD: "0",
				});

				expect(outcome.busted).toBe(true);
				expect(outcome.invalidated).toStrictEqual([]);
				expect(fs.existsSync(cacheFile)).toBe(false);
			},
		);
	});

	it("persists state but invalidates nothing on the first run", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export function a(): number { return 1; }\n",
				"src/b.ts":
					"import { a } from './a';\nexport function b(): number { return a() + 1; }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, ".eslintcache");
				const fileA = path.join(directory, "src/a.ts");
				const fileB = path.join(directory, "src/b.ts");
				seedCache(cacheFile, [fileA, fileB]);

				const outcome = invalidate(directory, [fileA, fileB], new Set());

				expect(outcome.firstRun).toBe(true);
				expect(outcome.busted).toBe(false);
				expect(outcome.invalidated).toStrictEqual([]);
				expect(
					fs.existsSync(
						path.join(directory, "node_modules/.cache/isentinel-lint/tsbuildinfo-full"),
					),
				).toBe(true);
				expect(cacheHasEntry(cacheFile, fileA)).toBe(true);
				expect(cacheHasEntry(cacheFile, fileB)).toBe(true);
			},
		);
	});

	it("skips when there is no tsconfig", () => {
		expect.hasAssertions();

		withFixture({ "src/a.ts": "export const a = 1;\n" }, (directory) => {
			const cacheFile = path.join(directory, ".eslintcache");
			const fileA = path.join(directory, "src/a.ts");
			seedCache(cacheFile, [fileA]);

			const outcome = invalidate(directory, [fileA], new Set());

			expect(outcome.skipped).toBe(true);
			expect(outcome.invalidated).toStrictEqual([]);
			expect(cacheHasEntry(cacheFile, fileA)).toBe(true);
		});
	});
});

describe("removeCacheEntries", () => {
	it("removes only the named entries and keeps the rest", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export const a = 1;\n",
				"src/b.ts": "export const b = 2;\n",
				"src/c.ts": "export const c = 3;\n",
			},
			(directory) => {
				const cacheFile = path.join(directory, ".eslintcache");
				const fileA = path.join(directory, "src/a.ts");
				const fileB = path.join(directory, "src/b.ts");
				const fileC = path.join(directory, "src/c.ts");
				seedCache(cacheFile, [fileA, fileB, fileC]);

				// Forward-slash path proves separator-insensitive matching.
				const removed = removeCacheEntries(cacheFile, [fileB.split(path.sep).join("/")]);

				expect(removed).toBe(1);
				expect(cacheHasEntry(cacheFile, fileA)).toBe(true);
				expect(cacheHasEntry(cacheFile, fileB)).toBe(false);
				expect(cacheHasEntry(cacheFile, fileC)).toBe(true);
			},
		);
	});
});
