// cspell:words tsbuildinfo typeaware globals CLAUDECODE normalised buildinfo
import fileEntryCache from "file-entry-cache";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { writeHybridStatus } from "../src/hybrid-status.ts";
import { computeAffectedFiles } from "../src/lint-cli/affected.ts";
import { resolveCacheKey } from "../src/lint-cli/cache-key.ts";
import { normalizePath, removeCacheEntries } from "../src/lint-cli/cache.ts";
import {
	applyConfigDriftBust,
	computeConfigHash,
	configHashStatePath,
} from "../src/lint-cli/config-hash.ts";
import { ALL_CACHE_FILES, CACHE_FILE_TYPE_AWARE, cacheFileFor } from "../src/lint-cli/constants.ts";
import { applyTypeAwareInvalidation } from "../src/lint-cli/invalidation.ts";
import { parseArguments } from "../src/lint-cli/options.ts";
import { composeCommands, plan } from "../src/lint-cli/run.ts";
import type { PassPlan } from "../src/lint-cli/run.ts";
import { withoutGitEnvironment } from "./without-git.ts";

/**
 * The config-variant key every fixture here runs under. All of these drive the
 * runner with an empty environment, so the key they resolve is fixed.
 */
const TEST_KEY = resolveCacheKey({});

/** The keyed type-aware cache file the runner reads and writes in a fixture. */
const TYPE_AWARE_CACHE = cacheFileFor(CACHE_FILE_TYPE_AWARE, TEST_KEY);

/** An environment that resolves to the agent config variant. */
const AGENT_ENVIRONMENT = { CLAUDECODE: "1" };

/** The agent variant's config-variant key. */
const AGENT_KEY = resolveCacheKey(AGENT_ENVIRONMENT);

const TSCONFIG = JSON.stringify({
	compilerOptions: { module: "commonjs", strict: true, target: "es2020" },
	include: ["src"],
});

/** The fixture the per-variant cache isolation tests share. */
const VARIANT_FIXTURE = {
	"eslint.config.ts": "export default [];\n",
	"src/a.ts": "export function a(): number { return 1; }\n",
	"tsconfig.json": TSCONFIG,
};

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

		// Seed a fresh hybrid status so the CLI's hybrid check trusts it rather
		// than probing a (here absent) ESLint binary. These fixtures ship no
		// eslint config file, so the status is always fresh; the seed keeps the
		// runner's oxlint/notice behaviour identical to a real hybrid project.
		fs.mkdirSync(path.join(directory, "node_modules"), { recursive: true });
		writeHybridStatus(directory, true);

		run(directory);
	} finally {
		fs.rmSync(root, { force: true, recursive: true });
	}
}

/**
 * A solution-style entry tsconfig whose files all live behind `references`, one
 * of them behind a *nested* solution — the shape that made builder invalidation
 * a silent no-op before reference resolution recursed.
 */
const SOLUTION_FIXTURE = {
	"app/b.ts": "import { a } from '../src/a';\nexport function b() { return a(); }\n",
	"app/tsconfig.json": JSON.stringify({
		compilerOptions: { composite: true, module: "commonjs", strict: true, target: "es2020" },
		include: ["."],
	}),
	"nested-solution/tsconfig.json": JSON.stringify({
		files: [],
		include: [],
		references: [{ path: "../app" }],
	}),
	"src/a.ts": "export function a() { return 1; }\n",
	"tsconfig.json": JSON.stringify({
		files: [],
		include: [],
		references: [{ path: "./tsconfig.lib.json" }, { path: "./nested-solution" }],
	}),
	"tsconfig.lib.json": JSON.stringify({
		compilerOptions: { composite: true, module: "commonjs", strict: true, target: "es2020" },
		include: ["src"],
	}),
};

/**
 * Builder state files matching a prefix. Every project's buildinfo is suffixed
 * with a digest of its tsconfig path, which is a temp directory here and so
 * cannot be spelled out — tests match the stable prefix and count instead.
 *
 * @param directory - The fixture project root.
 * @param prefix - The `tsbuildinfo-<mode>-<key>` prefix to match.
 * @returns The matching file names, empty when the cache directory is absent.
 */
function builderStateFiles(directory: string, prefix: string): Array<string> {
	const stateDirectory = path.join(directory, "node_modules/.cache/isentinel-lint");
	if (!fs.existsSync(stateDirectory)) {
		return [];
	}

	return fs.readdirSync(stateDirectory).filter((name) => name.startsWith(prefix));
}

/**
 * Compose a default (mutating) run inside a fixture, without the ambient git
 * environment.
 *
 * @param directory - The fixture project root.
 * @param argv - The CLI arguments (default: none).
 * @returns The composed command plan.
 */
function composeInFixture(
	directory: string,
	argv: Array<string> = [],
): ReturnType<typeof composeCommands> {
	return withoutGitEnvironment(() => {
		return composeCommands(parseArguments(argv, {}), {
			cwd: directory,
			dryRun: false,
			environment: {},
		});
	});
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
		key: TEST_KEY,
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
				const first = computeAffectedFiles(directory, undefined, TEST_KEY);

				expect(first?.firstRun).toBe(true);
				expect(first?.affected.size).toBeGreaterThan(0);

				const second = computeAffectedFiles(directory, undefined, TEST_KEY);

				expect(second?.firstRun).toBe(false);
				expect(second?.affected.size).toBe(0);
			},
		);
	});

	it("skips gracefully when no tsconfig is present", () => {
		expect.hasAssertions();

		withFixture({ "src/a.ts": "export const a = 1;\n" }, (directory) => {
			expect(computeAffectedFiles(directory, undefined, TEST_KEY)).toBeUndefined();
		});
	});

	it("resolves files through a nested solution-style reference graph", () => {
		expect.hasAssertions();

		withFixture(SOLUTION_FIXTURE, (directory) => {
			const first = computeAffectedFiles(directory, undefined, TEST_KEY);

			expect(first?.firstRun).toBe(true);
			// The entry tsconfig owns no files; both of these come from a
			// referenced project, `app/b.ts` via a nested solution-style one.
			// `affected` holds OS-normalised paths, so compare in that form.
			expect(first?.affected).toContain(path.normalize(path.join(directory, "src/a.ts")));
			expect(first?.affected).toContain(path.normalize(path.join(directory, "app/b.ts")));
		});
	});

	it("keeps builder state per referenced project", () => {
		expect.hasAssertions();

		withFixture(SOLUTION_FIXTURE, (directory) => {
			computeAffectedFiles(directory, "only", TEST_KEY);

			// One per file-owning project (lib + app); the file-less entry
			// tsconfig contributes no state of its own.
			expect(builderStateFiles(directory, `tsbuildinfo-typeaware-${TEST_KEY}`)).toHaveLength(
				2,
			);
		});
	});

	it("does not report first-run when only some projects are new", () => {
		expect.hasAssertions();

		withFixture(SOLUTION_FIXTURE, (directory) => {
			// Warm every project, then drop one project's state so it looks newly
			// added while its siblings stay warm — the shape of a solution that
			// gains a reference.
			computeAffectedFiles(directory, "only", TEST_KEY);
			const stateDirectory = path.join(directory, "node_modules/.cache/isentinel-lint");
			const prefix = `tsbuildinfo-typeaware-${TEST_KEY}`;
			const stateFiles = builderStateFiles(directory, prefix);

			expect(stateFiles.length).toBeGreaterThan(1);

			const [firstState = ""] = stateFiles;
			fs.rmSync(path.join(stateDirectory, firstState));

			const result = computeAffectedFiles(directory, "only", TEST_KEY);

			// The run is first-run only when NO project had prior state.
			// Reporting it here (as an OR-fold across projects would) would make
			// the caller discard the warm projects' drained affected sets while
			// their builder state had already advanced — the stale-cache defect.
			expect(result?.firstRun).toBe(false);
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
				computeAffectedFiles(directory, undefined, TEST_KEY);
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
				computeAffectedFiles(directory, undefined, TEST_KEY);
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

	it("invalidates an importer in another referenced project", () => {
		expect.hasAssertions();

		withFixture(SOLUTION_FIXTURE, (directory) => {
			const cacheFile = path.join(directory, ".eslintcache");
			const fileA = path.join(directory, "src/a.ts");
			const fileB = path.join(directory, "app/b.ts");
			computeAffectedFiles(directory, undefined, TEST_KEY);
			seedCache(cacheFile, [fileA, fileB]);
			fs.writeFileSync(fileA, "export function a() { return 'now a string'; }\n");
			touch(fileA);

			const dirty = new Set([normalizePath(fileA)]);
			const outcome = invalidate(directory, [fileA, fileB], dirty);

			expect(outcome.busted).toBe(false);
			expect(outcome.invalidated).toContain(normalizePath(fileB));
			expect(cacheHasEntry(cacheFile, fileB)).toBe(false);
		});
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
				computeAffectedFiles(directory, undefined, TEST_KEY);
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
				computeAffectedFiles(directory, undefined, TEST_KEY);
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
				expect(builderStateFiles(directory, `tsbuildinfo-full-${TEST_KEY}`)).toHaveLength(
					1,
				);
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

const JSON_TSCONFIG = JSON.stringify({
	compilerOptions: {
		esModuleInterop: true,
		module: "commonjs",
		resolveJsonModule: true,
		strict: true,
		target: "es2020",
	},
	include: ["src"],
});

describe("composeCommands typed-pass skip", () => {
	it("skips the typed pass in default mode when nothing type-relevant changed", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export function a(): number { return 1; }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, TYPE_AWARE_CACHE);
				const fileA = path.join(directory, "src/a.ts");
				// Establish builder state and seed the cache so a.ts is neither
				// mtime-dirty nor builder-affected on the next run.
				computeAffectedFiles(directory, "only", TEST_KEY);
				seedCache(cacheFile, [fileA]);

				const { commands, notice } = composeInFixture(directory);

				const labels = commands.map((command) => command.label);

				expect(labels).toContain("fast");
				expect(labels).not.toContain("typed");
				expect(notice).toMatch(/skipping the type-aware/);
			},
		);
	});

	it("skips the typed pass when the only uncached files are ESLint-ignored", () => {
		expect.hasAssertions();

		withFixture(
			{
				// A `.mjs` config so ESLint loads it without a TypeScript loader
				// in the fixture's bare node_modules.
				"eslint.config.mjs":
					'export default [{ files: ["**/*.{ts,mjs}"], rules: {} }, ' +
					'{ ignores: ["src/ignored.ts"] }];\n',
				"src/a.ts": "export function a(): number { return 1; }\n",
				"src/ignored.ts": "export function ignored(): number { return 2; }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, TYPE_AWARE_CACHE);
				// Seed every file ESLint actually lints. `src/ignored.ts` is a
				// target of the git listing but ESLint never lints it, so it
				// has no cache entry and reads as dirty on every run — the
				// phantom-dirty file that used to make the skip unreachable.
				computeAffectedFiles(directory, "only", TEST_KEY);
				seedCache(cacheFile, [
					path.join(directory, "src/a.ts"),
					path.join(directory, "eslint.config.mjs"),
				]);

				const { commands, notice } = composeInFixture(directory);

				expect(commands.map((command) => command.label)).not.toContain("typed");
				expect(notice).toMatch(/skipping the type-aware/);
			},
		);
	});

	it("never skips the typed pass when a target resolves outside cwd", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export function a(): number { return 1; }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, TYPE_AWARE_CACHE);
				const fileA = path.join(directory, "src/a.ts");
				computeAffectedFiles(directory, "only", TEST_KEY);
				seedCache(cacheFile, [fileA]);

				// "src" is in-cwd and clean, but "../elsewhere" escapes cwd, so
				// the dirty count is unknowable: the typed pass must not
				// auto-skip and a notice is emitted.
				const { commands, notice } = composeInFixture(directory, ["src", "../elsewhere"]);

				expect(commands.map((command) => command.label)).toContain("typed");
				expect(notice).toMatch(/resolves outside the working directory/);
			},
		);
	});

	it("never skips the typed pass when --type-aware=only is explicit", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export function a(): number { return 1; }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, TYPE_AWARE_CACHE);
				const fileA = path.join(directory, "src/a.ts");
				computeAffectedFiles(directory, "only", TEST_KEY);
				seedCache(cacheFile, [fileA]);

				const { commands, notice } = composeInFixture(directory, ["--type-aware=only"]);

				expect(commands.map((command) => command.label)).toContain("typed");
				expect(notice).toBeUndefined();
			},
		);
	});
});

describe("plan mutation", () => {
	const buildInfo = `tsbuildinfo-typeaware-${TEST_KEY}`;

	it("performs no I/O mutation in read-only (print) mode", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export function a(): number { return 1; }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, TYPE_AWARE_CACHE);
				const fileA = path.join(directory, "src/a.ts");
				seedCache(cacheFile, [fileA]);

				const runPlan = withoutGitEnvironment(() => {
					return plan(parseArguments([], {}), directory, {}, false);
				});

				expect(runPlan.passes.map((pass) => pass.descriptor.label)).toStrictEqual([
					"fast",
					"typed",
				]);
				// Read-only planning never runs the builder or deletes caches.
				expect(builderStateFiles(directory, buildInfo)).toHaveLength(0);
				expect(fs.existsSync(cacheFile)).toBe(true);

				// The mutating plan, by contrast, runs the builder.
				withoutGitEnvironment(() => plan(parseArguments([], {}), directory, {}, true));

				expect(builderStateFiles(directory, buildInfo)).toHaveLength(1);
			},
		);
	});

	it("marks the typed pass skipped in the plan when nothing type-relevant changed", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/a.ts": "export function a(): number { return 1; }\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, TYPE_AWARE_CACHE);
				const fileA = path.join(directory, "src/a.ts");
				computeAffectedFiles(directory, "only", TEST_KEY);
				seedCache(cacheFile, [fileA]);

				const runPlan = withoutGitEnvironment(() => {
					return plan(parseArguments([], {}), directory, {}, true);
				});
				const typed = runPlan.passes.find((pass) => pass.descriptor.label === "typed");

				expect(typed?.shouldRun).toBe(false);
				expect(typed?.skipReason).toMatch(/skipping the type-aware/);
			},
		);
	});
});

describe("per-variant cache isolation", () => {
	/**
	 * Seed a warm type-aware cache for one variant: establish its builder state
	 * so nothing is affected, then record `src/a.ts` as already linted.
	 *
	 * @param directory - The fixture root.
	 * @param environment - The environment identifying the variant.
	 * @returns The absolute path to the variant's seeded cache file.
	 */
	function seedVariant(directory: string, environment: NodeJS.ProcessEnv): string {
		const key = resolveCacheKey(environment);
		const cacheFile = path.join(directory, cacheFileFor(CACHE_FILE_TYPE_AWARE, key));
		computeAffectedFiles(directory, "only", key);
		seedCache(cacheFile, [path.join(directory, "src/a.ts")]);
		return cacheFile;
	}

	it("keeps both caches warm when agent and non-agent runs alternate", () => {
		expect.hasAssertions();

		withFixture(VARIANT_FIXTURE, (directory) => {
			const humanCache = seedVariant(directory, {});
			const agentCache = seedVariant(directory, AGENT_ENVIRONMENT);

			withoutGitEnvironment(() => {
				plan(parseArguments([], {}), directory, AGENT_ENVIRONMENT, true);
				plan(parseArguments([], {}), directory, {}, true);
				plan(parseArguments([], {}), directory, AGENT_ENVIRONMENT, true);
			});

			// Before the split, each run rewrote the single cache with its own
			// resolved config, so the other variant re-linted everything.
			expect(fs.existsSync(humanCache)).toBe(true);
			expect(fs.existsSync(agentCache)).toBe(true);
		});
	});

	it("busts only the stale variant when the config changes", () => {
		expect.hasAssertions();

		withFixture(VARIANT_FIXTURE, (directory) => {
			const humanCache = seedVariant(directory, {});
			const agentCache = seedVariant(directory, AGENT_ENVIRONMENT);

			// The config now post-dates the agent cache but not the human one.
			const configSeconds = Date.now() / 1000 + 60;
			fs.utimesSync(path.join(directory, "eslint.config.ts"), configSeconds, configSeconds);
			fs.utimesSync(humanCache, configSeconds + 60, configSeconds + 60);

			withoutGitEnvironment(() => plan(parseArguments([], {}), directory, {}, true));

			expect(fs.existsSync(agentCache)).toBe(false);
			expect(fs.existsSync(humanCache)).toBe(true);
		});
	});

	it("never deletes a stale cache in read-only (print) mode", () => {
		expect.hasAssertions();

		withFixture(VARIANT_FIXTURE, (directory) => {
			const agentCache = seedVariant(directory, AGENT_ENVIRONMENT);
			const configSeconds = Date.now() / 1000 + 60;
			fs.utimesSync(path.join(directory, "eslint.config.ts"), configSeconds, configSeconds);

			withoutGitEnvironment(() => plan(parseArguments([], {}), directory, {}, false));

			expect(fs.existsSync(agentCache)).toBe(true);
		});
	});

	it("keys the builder state per variant", () => {
		expect.hasAssertions();

		withFixture(VARIANT_FIXTURE, (directory) => {
			computeAffectedFiles(directory, "only", TEST_KEY);
			computeAffectedFiles(directory, "only", AGENT_KEY);

			expect(builderStateFiles(directory, `tsbuildinfo-typeaware-${TEST_KEY}`)).toHaveLength(
				1,
			);
			expect(builderStateFiles(directory, `tsbuildinfo-typeaware-${AGENT_KEY}`)).toHaveLength(
				1,
			);
		});
	});
});

describe("resolveJsonModule invalidation", () => {
	it("invalidates a .ts importer when an imported .json changes shape", () => {
		expect.hasAssertions();

		withFixture(
			{
				"src/b.ts":
					"import data from './data.json';\nexport function b() { return data.value; }\n",
				"src/data.json": '{ "value": 1 }\n',
				"tsconfig.json": JSON_TSCONFIG,
			},
			(directory) => {
				const cacheFile = path.join(directory, ".eslintcache");
				const fileB = path.join(directory, "src/b.ts");
				const fileData = path.join(directory, "src/data.json");
				computeAffectedFiles(directory, undefined, TEST_KEY);
				seedCache(cacheFile, [fileB]);
				fs.writeFileSync(fileData, '{ "value": "now a string" }\n');
				touch(fileData);

				const outcome = invalidate(
					directory,
					[fileData, fileB],
					new Set([normalizePath(fileData)]),
				);

				expect(outcome.invalidated).toContain(normalizePath(fileB));
				expect(cacheHasEntry(cacheFile, fileB)).toBe(false);
			},
		);
	});
});

/** A config whose resolved shape depends on a local module it imports. */
const CONFIG_IMPORT_FIXTURE = {
	"eslint-rules.ts": "export const rules = { rules: {} };\n",
	// The config must actually match the fixture's files: ESLint reports a file
	// no config matches as ignored, and the runner drops ignored files from its
	// dirty count.
	"eslint.config.ts":
		"import './eslint-rules';\nexport default [{ files: ['**/*.ts'], rules: {} }];\n",
	"src/a.ts": "export function a(): number { return 1; }\n",
	"tsconfig.json": TSCONFIG,
};

function configBustFiles(directory: string): Array<string> {
	return [path.join(directory, "eslint.config.ts")];
}

/**
 * The config hash a fixture's entry point currently hashes to.
 *
 * @param directory - The fixture project root.
 * @returns The hash, or undefined when it could not be computed.
 */
function configHashFor(directory: string): string | undefined {
	return computeConfigHash(directory, configBustFiles(directory));
}

function seedAllCaches(directory: string, key: string): void {
	for (const name of ALL_CACHE_FILES) {
		fs.writeFileSync(path.join(directory, cacheFileFor(name, key)), "{}");
	}
}

function cacheExists(directory: string, key: string, name: string): boolean {
	return fs.existsSync(path.join(directory, cacheFileFor(name, key)));
}

function everyCacheExists(directory: string, key: string): boolean {
	return ALL_CACHE_FILES.every((name) => cacheExists(directory, key, name));
}

function anyCacheExists(directory: string, key: string): boolean {
	return ALL_CACHE_FILES.some((name) => cacheExists(directory, key, name));
}

function editRules(directory: string): void {
	fs.writeFileSync(
		path.join(directory, "eslint-rules.ts"),
		"export const rules = { rules: { x: 1 } };\n",
	);
}

describe("applyConfigDriftBust", () => {
	it("stores the hash without busting on the first run", () => {
		expect.hasAssertions();

		withFixture(CONFIG_IMPORT_FIXTURE, (directory) => {
			seedAllCaches(directory, TEST_KEY);

			const outcome = applyConfigDriftBust(directory, TEST_KEY, configHashFor(directory));

			expect(outcome).toStrictEqual({ busted: false, firstRun: true });
			expect(everyCacheExists(directory, TEST_KEY)).toBe(true);
		});
	});

	it("busts every cache when an imported config module changes", () => {
		expect.hasAssertions();

		withFixture(CONFIG_IMPORT_FIXTURE, (directory) => {
			applyConfigDriftBust(directory, TEST_KEY, configHashFor(directory));
			seedAllCaches(directory, TEST_KEY);
			editRules(directory);

			const outcome = applyConfigDriftBust(directory, TEST_KEY, configHashFor(directory));

			expect(outcome).toStrictEqual({ busted: true, firstRun: false });
			// Unlike the package.json bust, the fast (syntactic) cache is dropped
			// too: a rule-severity change alters a syntactic lint.
			expect(anyCacheExists(directory, TEST_KEY)).toBe(false);
		});
	});

	it("does not bust when an imported module is only touched", () => {
		expect.hasAssertions();

		withFixture(CONFIG_IMPORT_FIXTURE, (directory) => {
			applyConfigDriftBust(directory, TEST_KEY, configHashFor(directory));
			seedAllCaches(directory, TEST_KEY);
			touch(path.join(directory, "eslint-rules.ts"));

			const outcome = applyConfigDriftBust(directory, TEST_KEY, configHashFor(directory));

			// Content-addressed, so an mtime bump with identical content is a
			// no-op.
			expect(outcome).toStrictEqual({ busted: false, firstRun: false });
			expect(everyCacheExists(directory, TEST_KEY)).toBe(true);
		});
	});

	it("lets each variant observe the same drift independently", () => {
		expect.hasAssertions();

		withFixture(CONFIG_IMPORT_FIXTURE, (directory) => {
			applyConfigDriftBust(directory, TEST_KEY, configHashFor(directory));
			applyConfigDriftBust(directory, AGENT_KEY, configHashFor(directory));
			seedAllCaches(directory, TEST_KEY);
			seedAllCaches(directory, AGENT_KEY);
			editRules(directory);

			expect(
				applyConfigDriftBust(directory, TEST_KEY, configHashFor(directory)),
			).toStrictEqual({
				busted: true,
				firstRun: false,
			});
			// The no-agent run must not consume the drift on the agent's behalf.
			expect(everyCacheExists(directory, AGENT_KEY)).toBe(true);

			expect(
				applyConfigDriftBust(directory, AGENT_KEY, configHashFor(directory)),
			).toStrictEqual({
				busted: true,
				firstRun: false,
			});
			expect(anyCacheExists(directory, AGENT_KEY)).toBe(false);
		});
	});

	it("stores each variant's hash under its own state file", () => {
		expect.hasAssertions();

		expect(configHashStatePath("/project", "aaaa1111")).not.toBe(
			configHashStatePath("/project", "bbbb2222"),
		);
	});

	it("no-ops when there is no config entry point", () => {
		expect.hasAssertions();

		withFixture(CONFIG_IMPORT_FIXTURE, (directory) => {
			seedAllCaches(directory, TEST_KEY);

			const outcome = applyConfigDriftBust(
				directory,
				TEST_KEY,
				computeConfigHash(directory, []),
			);

			expect(outcome).toStrictEqual({ busted: false, firstRun: false });
			expect(everyCacheExists(directory, TEST_KEY)).toBe(true);
		});
	});

	it("no-ops when typescript cannot be resolved", () => {
		expect.hasAssertions();

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-cfg-"));
		try {
			fs.writeFileSync(path.join(directory, "eslint.config.ts"), "export default [];\n");
			const roots = [path.join(directory, "eslint.config.ts")];

			expect(computeConfigHash(directory, roots)).toBeUndefined();
			expect(
				applyConfigDriftBust(directory, TEST_KEY, computeConfigHash(directory, roots)),
			).toStrictEqual({
				busted: false,
				firstRun: false,
			});
		} finally {
			fs.rmSync(directory, { force: true, recursive: true });
		}
	});
});

describe("computeConfigHash discovery", () => {
	it("follows transitive imports and re-exports", () => {
		expect.hasAssertions();

		withFixture(
			{
				"a.ts": "export * from './b';\n",
				"b.ts": "export const b = 1;\n",
				"eslint.config.ts": "import './a';\nexport default [];\n",
				"tsconfig.json": TSCONFIG,
			},
			(directory) => {
				const before = computeConfigHash(directory, configBustFiles(directory));
				fs.writeFileSync(path.join(directory, "b.ts"), "export const b = 2;\n");
				const after = computeConfigHash(directory, configBustFiles(directory));

				expect(before).toBeDefined();
				expect(after).not.toBe(before);
			},
		);
	});

	it("resolves tsconfig path aliases", () => {
		expect.hasAssertions();

		withFixture(
			{
				"config/rules.ts": "export const rules = {};\n",
				"eslint.config.ts": "import '@rules';\nexport default [];\n",
				"tsconfig.json": JSON.stringify({
					compilerOptions: {
						baseUrl: ".",
						module: "commonjs",
						paths: { "@rules": ["./config/rules"] },
						strict: true,
						target: "es2020",
					},
					include: ["src"],
				}),
			},
			(directory) => {
				const before = computeConfigHash(directory, configBustFiles(directory));
				fs.writeFileSync(
					path.join(directory, "config/rules.ts"),
					"export const rules = { x: 1 };\n",
				);
				const after = computeConfigHash(directory, configBustFiles(directory));

				expect(before).toBeDefined();
				expect(after).not.toBe(before);
			},
		);
	});

	it("ignores files the config does not import", () => {
		expect.hasAssertions();

		withFixture(
			{
				"eslint.config.ts": "import './rules';\nexport default [];\n",
				"rules.ts": "export const rules = {};\n",
				"tsconfig.json": TSCONFIG,
				"unrelated.ts": "export const x = 1;\n",
			},
			(directory) => {
				const before = computeConfigHash(directory, configBustFiles(directory));
				fs.writeFileSync(path.join(directory, "unrelated.ts"), "export const x = 2;\n");
				const after = computeConfigHash(directory, configBustFiles(directory));

				expect(before).toBeDefined();
				expect(after).toBe(before);
			},
		);
	});
});

describe("config drift sizing", () => {
	function typedPass(runPlan: ReturnType<typeof plan>): PassPlan | undefined {
		return runPlan.passes.find((pass) => pass.descriptor.label === "typed");
	}

	it("un-skips the typed pass when a module the config imports changed", () => {
		expect.hasAssertions();

		// Lint only `src`; the imported `eslint-rules.ts` sits at the root, so it
		// is neither a lint target nor a cache-bust file. Editing it therefore
		// changes nothing the mtime dirty count can see — only the config-drift
		// bust can trigger the re-lint, isolating the fix.
		withFixture(CONFIG_IMPORT_FIXTURE, (directory) => {
			const cacheFile = path.join(directory, TYPE_AWARE_CACHE);
			const fileA = path.join(directory, "src/a.ts");
			const args = parseArguments(["src"], {});
			computeAffectedFiles(directory, "only", TEST_KEY);
			seedCache(cacheFile, [fileA]);
			const warm = withoutGitEnvironment(() => plan(args, directory, {}, true));

			expect(typedPass(warm)?.shouldRun).toBe(false);

			// No bust file changes on disk, but the resolved config (and ESLint's
			// hashOfConfig) shifts, so the drift bust must delete the caches and
			// the typed pass must run at full size.
			editRules(directory);
			const drifted = withoutGitEnvironment(() => plan(args, directory, {}, true));

			expect(typedPass(drifted)?.shouldRun).toBe(true);
		});
	});
});
