// cspell:words tsbuildinfo typeaware globals CLAUDECODE
import fileEntryCache from "file-entry-cache";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { computeAffectedFiles } from "../src/lint-cli/affected.ts";
import { resolveCacheKey } from "../src/lint-cli/cache-key.ts";
import { normalizePath, removeCacheEntries } from "../src/lint-cli/cache.ts";
import { CACHE_FILE_TYPE_AWARE, cacheFileFor } from "../src/lint-cli/constants.ts";
import { writeHybridStatus } from "../src/lint-cli/hybrid-status.ts";
import { applyTypeAwareInvalidation } from "../src/lint-cli/invalidation.ts";
import { parseArguments } from "../src/lint-cli/options.ts";
import { composeCommands, plan } from "../src/lint-cli/run.ts";
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
				expect(
					fs.existsSync(
						path.join(
							directory,
							`node_modules/.cache/isentinel-lint/tsbuildinfo-full-${TEST_KEY}`,
						),
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

				const { commands, notice } = withoutGitEnvironment(() => {
					return composeCommands(parseArguments([]), {
						cwd: directory,
						dryRun: false,
						environment: {},
					});
				});

				const labels = commands.map((command) => command.label);

				expect(labels).toContain("fast");
				expect(labels).not.toContain("typed");
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
				const { commands, notice } = withoutGitEnvironment(() => {
					return composeCommands(parseArguments(["src", "../elsewhere"]), {
						cwd: directory,
						dryRun: false,
						environment: {},
					});
				});

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

				const { commands, notice } = withoutGitEnvironment(() => {
					return composeCommands(parseArguments(["--type-aware=only"]), {
						cwd: directory,
						dryRun: false,
						environment: {},
					});
				});

				expect(commands.map((command) => command.label)).toContain("typed");
				expect(notice).toBeUndefined();
			},
		);
	});
});

describe("plan mutation", () => {
	const buildInfo = `node_modules/.cache/isentinel-lint/tsbuildinfo-typeaware-${TEST_KEY}`;

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
					return plan(parseArguments([]), directory, {}, false);
				});

				expect(runPlan.passes.map((pass) => pass.descriptor.label)).toStrictEqual([
					"fast",
					"typed",
				]);
				// Read-only planning never runs the builder or deletes caches.
				expect(fs.existsSync(path.join(directory, buildInfo))).toBe(false);
				expect(fs.existsSync(cacheFile)).toBe(true);

				// The mutating plan, by contrast, runs the builder.
				withoutGitEnvironment(() => plan(parseArguments([]), directory, {}, true));

				expect(fs.existsSync(path.join(directory, buildInfo))).toBe(true);
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
					return plan(parseArguments([]), directory, {}, true);
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
				plan(parseArguments([]), directory, AGENT_ENVIRONMENT, true);
				plan(parseArguments([]), directory, {}, true);
				plan(parseArguments([]), directory, AGENT_ENVIRONMENT, true);
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

			withoutGitEnvironment(() => plan(parseArguments([]), directory, {}, true));

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

			withoutGitEnvironment(() => plan(parseArguments([]), directory, {}, false));

			expect(fs.existsSync(agentCache)).toBe(true);
		});
	});

	it("keys the builder state per variant", () => {
		expect.hasAssertions();

		withFixture(VARIANT_FIXTURE, (directory) => {
			computeAffectedFiles(directory, "only", TEST_KEY);
			computeAffectedFiles(directory, "only", AGENT_KEY);

			const stateDirectory = path.join(directory, "node_modules", ".cache", "isentinel-lint");

			expect(
				fs.existsSync(path.join(stateDirectory, `tsbuildinfo-typeaware-${TEST_KEY}`)),
			).toBe(true);
			expect(
				fs.existsSync(path.join(stateDirectory, `tsbuildinfo-typeaware-${AGENT_KEY}`)),
			).toBe(true);
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
