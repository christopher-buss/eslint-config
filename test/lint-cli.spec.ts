// cspell:words typeaware lintable mtimes CLAUDECODE extensionless
import fileEntryCache from "file-entry-cache";
import { getPackageInfoSync } from "local-pkg";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { satisfies } from "semver";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { isRecord } from "../src/guards.ts";
import { hybridStatusPath, readHybridStatus, writeHybridStatus } from "../src/hybrid-status.ts";
import type { HybridStatus } from "../src/hybrid-status.ts";
import { applyHashBust, PACKAGE_RESOLUTION } from "../src/lint-cli/lib/cache/bust.ts";
import type { BustOutcome } from "../src/lint-cli/lib/cache/bust.ts";
import {
	ALL_CACHE_FILES,
	CACHE_FILE_DEFAULT,
	CACHE_FILE_FAST,
	CACHE_FILE_TYPE_AWARE,
	cacheFileFor,
} from "../src/lint-cli/lib/cache/constants.ts";
import {
	isCacheStale,
	maxMtimeMs,
	normalizePath,
	openCache,
	sweepStaleCaches,
} from "../src/lint-cli/lib/cache/entries.ts";
import { computePackageJsonHash } from "../src/lint-cli/lib/cache/package-hash.ts";
import { parseArguments } from "../src/lint-cli/lib/cli/options.ts";
import { splitArgs } from "../src/lint-cli/lib/cli/split-args.ts";
import type {
	ChildCommand,
	ComposeContext,
	LintCliOptions,
} from "../src/lint-cli/lib/cli/types.ts";
import { CliError } from "../src/lint-cli/lib/cli/types.ts";
import { resolveCacheKey } from "../src/lint-cli/lib/context.ts";
import type { RunContext } from "../src/lint-cli/lib/context.ts";
import { execute, executeStaged } from "../src/lint-cli/lib/exec/execute.ts";
import { buildShellCommand, formatCommandLine } from "../src/lint-cli/lib/exec/shell.ts";
import { collectRepoFiles, oxlintTargets } from "../src/lint-cli/lib/files/collect.ts";
import type { RepoFiles } from "../src/lint-cli/lib/files/collect.ts";
import { findWorkspaceRoot } from "../src/lint-cli/lib/files/workspace.ts";
import {
	HYBRID_UNKNOWN_WARNING,
	NON_HYBRID_WARNING,
	resolveOxlintRun,
} from "../src/lint-cli/lib/hybrid/gate.ts";
import { parseHybridPrintConfig } from "../src/lint-cli/lib/hybrid/probe.ts";
import { composeEslintCommand, composeOxlintCommand } from "../src/lint-cli/lib/plan/command.ts";
import {
	computeWorkerCount,
	resolveFastFilesPerWorker,
	resolveWorkerLimits,
	TYPED_MAX_WORKERS,
} from "../src/lint-cli/lib/plan/concurrency.ts";
import { collectFixTargets, planFixChild } from "../src/lint-cli/lib/plan/fix.ts";
import type { FixInputs } from "../src/lint-cli/lib/plan/fix.ts";
import {
	FAST_PASS,
	FULL_PASS,
	maxWorkersFor,
	TYPED_PASS,
} from "../src/lint-cli/lib/plan/passes.ts";
import type { PassDescriptor } from "../src/lint-cli/lib/plan/passes.ts";
import { plan } from "../src/lint-cli/lib/plan/plan.ts";
import type { PassPlan } from "../src/lint-cli/lib/plan/sizing.ts";
import { runLint } from "../src/lint-cli/lib/run.ts";
import { composeInDirectory, runContext } from "./lint-cli-helpers.ts";
import { withoutGitEnvironment } from "./without-git.ts";

function baseContext(overrides: Partial<ComposeContext> = {}): ComposeContext {
	return {
		agentsFormatterPath: "/dist/formatter-agents.mjs",
		cacheLocation: ".eslintcache",
		ci: false,
		concurrency: "off",
		eslintLabel: "eslint",
		fix: false,
		paths: ["."],
		typeAwareEnv: undefined,
		...overrides,
	};
}

function options(overrides: Partial<LintCliOptions> = {}): LintCliOptions {
	return {
		agents: false,
		cache: true,
		concurrency: undefined,
		eslint: false,
		eslintArgs: [],
		fix: false,
		oxlint: false,
		oxlintArgs: [],
		oxlintTypeAware: true,
		paths: ["."],
		print: false,
		typeAware: undefined,
		...overrides,
	};
}

function temporaryDirectory(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-"));

	onTestFinished(() => {
		fs.rmSync(directory, { force: true, recursive: true });
	});

	return directory;
}

/**
 * Lint a directory with the real ESLint, leaving the cache it writes behind.
 *
 * @param cwd - The directory to lint.
 * @param cacheFile - Where ESLint should write its cache.
 */
function lintWithCache(cwd: string, cacheFile: string): void {
	const manifest = createRequire(`${process.cwd()}/`).resolve("eslint/package.json");
	const bin = path.join(path.dirname(manifest), "bin", "eslint.js");

	try {
		execFileSync(process.execPath, [bin, "--cache", "--cache-location", cacheFile, "."], {
			cwd,
			stdio: "ignore",
		});
	} catch {
		// ESLint exits non-zero on the errors this fixture is built to produce.
	}
}

function workerCount(dirty: number, perWorker: number, max: number): "off" | number {
	return computeWorkerCount({ dirtyCount: dirty, filesPerWorker: perWorker, maxWorkers: max });
}

/**
 * The keyed cache file name a run under `environment` writes for a pass. Cache
 * files carry a config-variant key, so assertions derive the name rather than
 * hardcoding it.
 *
 * @param baseName - The pass's cache base name.
 * @param environment - The environment the run resolves its key from.
 * @returns The keyed cache file name.
 */
function keyedCacheFile(baseName: string, environment: NodeJS.ProcessEnv = {}): string {
	return cacheFileFor(baseName, resolveCacheKey(environment));
}

function seedFileCache(cacheFile: string, files: Array<string>): void {
	const cache = fileEntryCache.create(path.basename(cacheFile), path.dirname(cacheFile));
	for (const file of files) {
		cache.getFileDescriptor(file);
	}

	cache.reconcile();
}

function concurrencyArgument(commands: Array<ChildCommand>, label: string): string {
	const command = commands.find((entry) => entry.label === label);
	const index = command?.args.indexOf("--concurrency") ?? -1;
	return command?.args[index + 1] ?? "";
}

describe("parseArguments", () => {
	it("defaults paths to '.'", () => {
		expect.assertions(1);

		expect(parseArguments([], {}).paths).toStrictEqual(["."]);
	});

	it("keeps explicit paths", () => {
		expect.assertions(1);

		expect(parseArguments(["src", "test"], {}).paths).toStrictEqual(["src", "test"]);
	});

	it("errors when --eslint and --oxlint are combined", () => {
		expect.assertions(1);

		expect(() => parseArguments(["--eslint", "--oxlint"], {})).toThrow(CliError);
	});

	it("errors when --fix is combined with --type-aware", () => {
		expect.assertions(1);

		expect(() => parseArguments(["--fix", "--type-aware=only"], {})).toThrow(
			/Cannot combine --fix with --type-aware/,
		);
	});

	it("errors on unknown flags", () => {
		expect.assertions(1);

		expect(() => parseArguments(["--nope"], {})).toThrow(CliError);
	});

	it("errors on invalid --concurrency", () => {
		expect.assertions(1);

		expect(() => parseArguments(["--concurrency", "banana"], {})).toThrow(
			/Invalid --concurrency/,
		);
	});

	it("accepts numeric and off concurrency overrides", () => {
		expect.assertions(2);

		expect(parseArguments(["--concurrency", "6"], {}).concurrency).toBe(6);
		expect(parseArguments(["--concurrency", "off"], {}).concurrency).toBe("off");
	});

	it("errors when bare -- passthrough is used without a single tool", () => {
		expect.assertions(2);

		expect(() => parseArguments(["--", "--foo"], {})).toThrow(/single tool/);
		expect(() => parseArguments(["--eslint", "--oxlint", "--", "--foo"], {})).toThrow(CliError);
	});

	it("forwards -- passthrough to the selected tool", () => {
		expect.assertions(2);

		expect(parseArguments(["--oxlint", "--", "--deny", "all"], {}).oxlintArgs).toStrictEqual([
			"--deny",
			"all",
		]);
		expect(
			parseArguments(["--eslint", "--", "--max-warnings", "0"], {}).eslintArgs,
		).toStrictEqual(["--max-warnings", "0"]);
	});

	it("splits dash-prefixed per-tool extra args", () => {
		expect.assertions(2);

		const parsed = parseArguments(
			["--eslint-args", "--max-warnings 0", "--oxlint-args=--quiet"],
			{},
		);

		expect(parsed.eslintArgs).toStrictEqual(["--max-warnings", "0"]);
		expect(parsed.oxlintArgs).toStrictEqual(["--quiet"]);
	});

	it("parses cache and type-aware toggles", () => {
		expect.assertions(3);

		const parsed = parseArguments(
			["--no-cache", "--no-oxlint-type-aware", "--type-aware=off"],
			{},
		);

		expect(parsed.cache).toBe(false);
		expect(parsed.oxlintTypeAware).toBe(false);
		expect(parsed.typeAware).toBe("off");
	});

	it("defaults --agents to the detected agent session", () => {
		expect.assertions(3);

		expect(parseArguments([], {}).agents).toBe(false);
		expect(parseArguments([], { CLAUDECODE: "1" }).agents).toBe(true);
		expect(parseArguments([], { CLAUDECODE: "1", GIT_HOOK: "1" }).agents).toBe(false);
	});

	it("lets --agents and --no-agents override the detection", () => {
		expect.assertions(2);

		expect(parseArguments(["--agents"], {}).agents).toBe(true);
		expect(parseArguments(["--no-agents"], { CLAUDECODE: "1" }).agents).toBe(false);
	});
});

describe("computeWorkerCount", () => {
	it("returns off for zero or single-worker workloads", () => {
		expect.assertions(2);

		expect(workerCount(0, 350, 8)).toBe("off");
		expect(workerCount(350, 350, 8)).toBe("off");
	});

	it("scales with the dirty count", () => {
		expect.assertions(2);

		expect(workerCount(400, 350, 8)).toBe(2);
		expect(workerCount(1400, 350, 8)).toBe(4);
	});

	it("caps at maxWorkers", () => {
		expect.assertions(1);

		expect(workerCount(100_000, 350, 3)).toBe(3);
	});

	it("returns off when the cap is below two", () => {
		expect.assertions(1);

		expect(workerCount(100_000, 350, 1)).toBe("off");
	});
});

describe("per-pass worker caps", () => {
	it("caps the program-building passes below the shared cap", () => {
		expect.assertions(4);

		const limits = resolveWorkerLimits({}, 64, false);

		expect(limits.maxWorkers).toBe(16);
		expect(maxWorkersFor(TYPED_PASS, limits)).toBe(TYPED_MAX_WORKERS);
		expect(maxWorkersFor(FULL_PASS, limits)).toBe(TYPED_MAX_WORKERS);
		expect(maxWorkersFor(FAST_PASS, limits)).toBe(16);
	});

	it("leaves the shared cap alone when it is already the tighter one", () => {
		expect.assertions(1);

		const limits = resolveWorkerLimits({}, 16, false);

		expect(maxWorkersFor(TYPED_PASS, limits)).toBe(4);
	});

	it("never overrides an explicit LINT_MAX_WORKERS", () => {
		expect.assertions(2);

		const limits = resolveWorkerLimits({ LINT_MAX_WORKERS: "12" }, 64, false);

		expect(maxWorkersFor(TYPED_PASS, limits)).toBe(12);
		expect(maxWorkersFor(FAST_PASS, limits)).toBe(12);
	});
});

describe("resolveWorkerLimits", () => {
	it("defaults to 300 files per worker and a quarter of the CPUs", () => {
		expect.assertions(1);

		expect(resolveWorkerLimits({}, 16, false)).toStrictEqual({
			filesPerWorker: 300,
			maxWorkers: 4,
			typedMaxWorkers: 4,
		});
	});

	it("honours env overrides", () => {
		expect.assertions(1);

		const limits = resolveWorkerLimits(
			{ FILES_PER_WORKER: "200", LINT_MAX_WORKERS: "6" },
			16,
			false,
		);

		expect(limits).toStrictEqual({
			filesPerWorker: 200,
			maxWorkers: 6,
			typedMaxWorkers: 6,
		});
	});

	it("ignores invalid env overrides", () => {
		expect.assertions(1);

		const limits = resolveWorkerLimits(
			{ FILES_PER_WORKER: "0", LINT_MAX_WORKERS: "x" },
			16,
			false,
		);

		expect(limits).toStrictEqual({
			filesPerWorker: 300,
			maxWorkers: 4,
			typedMaxWorkers: 4,
		});
	});

	it("uses the full parallelism in CI", () => {
		expect.assertions(1);

		expect(resolveWorkerLimits({}, 4, true)).toStrictEqual({
			filesPerWorker: 300,
			maxWorkers: 4,
			typedMaxWorkers: 4,
		});
	});

	it("still caps the program-building passes in CI", () => {
		expect.assertions(2);

		const limits = resolveWorkerLimits({}, 16, true);

		expect(limits.maxWorkers).toBe(16);
		expect(limits.typedMaxWorkers).toBe(TYPED_MAX_WORKERS);
	});

	it("prefers an explicit LINT_MAX_WORKERS over the CI sizing", () => {
		expect.assertions(2);

		const limits = resolveWorkerLimits({ LINT_MAX_WORKERS: "2" }, 16, true);

		expect(limits.maxWorkers).toBe(2);
		expect(limits.typedMaxWorkers).toBe(2);
	});
});

describe("cache helpers", () => {
	it("folds case only where the filesystem is case-insensitive", () => {
		expect.assertions(2);

		const upper = path.resolve("/repo/src/Foo.ts");
		const lower = path.resolve("/repo/src/foo.ts");

		expect(normalizePath(upper, "linux")).not.toBe(normalizePath(lower, "linux"));
		expect(normalizePath(upper, "win32")).toBe(normalizePath(lower, "win32"));
	});

	it("detects a bust file newer than the cache", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const cacheFile = path.join(directory, ".eslintcache");
		const configFile = path.join(directory, "eslint.config.ts");
		fs.writeFileSync(cacheFile, "{}");
		fs.writeFileSync(configFile, "export default []");
		const future = Date.now() / 1000 + 60;
		fs.utimesSync(configFile, future, future);

		expect(isCacheStale(cacheFile, maxMtimeMs([configFile]))).toBe(true);
	});

	it("returns false when the cache is newer than every bust file", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const cacheFile = path.join(directory, ".eslintcache");
		const configFile = path.join(directory, "eslint.config.ts");
		fs.writeFileSync(configFile, "export default []");
		const past = Date.now() / 1000 - 60;
		fs.utimesSync(configFile, past, past);
		fs.writeFileSync(cacheFile, "{}");

		expect(isCacheStale(cacheFile, maxMtimeMs([configFile]))).toBe(false);
	});

	it("returns false when the cache file is missing", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(isCacheStale(path.join(directory, "missing"), maxMtimeMs([]))).toBe(false);
	});

	it("sweeps every managed cache file when all are stale", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		for (const name of ALL_CACHE_FILES) {
			fs.writeFileSync(path.join(directory, name), "{}");
		}

		// A bust newer than every cache makes all of them stale.
		sweepStaleCaches(directory, Date.now() + 60_000);

		expect(ALL_CACHE_FILES.every((name) => !fs.existsSync(path.join(directory, name)))).toBe(
			true,
		);
	});

	it("sweeps keyed cache variants, not just the base names", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const variants = ALL_CACHE_FILES.flatMap((name) => [
			cacheFileFor(name, "aaaa1111"),
			cacheFileFor(name, "bbbb2222"),
		]);
		for (const name of variants) {
			fs.writeFileSync(path.join(directory, name), "{}");
		}

		sweepStaleCaches(directory, Date.now() + 60_000);

		expect(variants.every((name) => !fs.existsSync(path.join(directory, name)))).toBe(true);
	});

	describe("sweepStaleCaches", () => {
		/**
		 * Write a cache file whose mtime sits a fixed offset from the bust
		 * file's, so staleness never depends on filesystem timestamp
		 * resolution.
		 *
		 * @param filePath - The cache file to write.
		 * @param mtimeSeconds - The mtime to stamp it with, in seconds.
		 */
		function writeCacheAt(filePath: string, mtimeSeconds: number): void {
			fs.writeFileSync(filePath, "{}");
			fs.utimesSync(filePath, mtimeSeconds, mtimeSeconds);
		}

		it("deletes only the individually stale variants", () => {
			expect.assertions(3);

			const directory = temporaryDirectory();
			const configFile = path.join(directory, "eslint.config.ts");
			const bustSeconds = Date.now() / 1000;
			fs.writeFileSync(configFile, "export default [];");
			fs.utimesSync(configFile, bustSeconds, bustSeconds);

			const stale = path.join(directory, cacheFileFor(CACHE_FILE_FAST, "aaaa1111"));
			const fresh = path.join(directory, cacheFileFor(CACHE_FILE_FAST, "bbbb2222"));
			writeCacheAt(stale, bustSeconds - 60);
			writeCacheAt(fresh, bustSeconds + 60);

			const removed = sweepStaleCaches(directory, bustSeconds * 1000);

			expect(removed).toStrictEqual([stale]);
			expect(fs.existsSync(stale)).toBe(false);
			expect(fs.existsSync(fresh)).toBe(true);
		});

		it("deletes nothing when there is no bust file", () => {
			expect.assertions(2);

			const directory = temporaryDirectory();
			const cacheFile = path.join(directory, cacheFileFor(CACHE_FILE_FAST, "aaaa1111"));
			fs.writeFileSync(cacheFile, "{}");

			expect(sweepStaleCaches(directory, undefined)).toStrictEqual([]);
			expect(fs.existsSync(cacheFile)).toBe(true);
		});
	});

	describe("resolveCacheKey", () => {
		it("separates the agent, editor, CI, no-autofix and default variants", () => {
			expect.assertions(1);

			const keys = [
				resolveCacheKey({}),
				resolveCacheKey({ CLAUDECODE: "1" }),
				resolveCacheKey({ VSCODE_PID: "1" }),
				resolveCacheKey({ CI: "true" }),
				resolveCacheKey({ ESLINT_AGENT_NO_AUTOFIX: "1" }),
			];

			const unique = new Set(keys);

			expect(unique.size).toBe(keys.length);
		});

		it("pins a git-hook run to the same variant as a plain run", () => {
			expect.assertions(1);

			// `isInAgentSession` and `isInEditorEnvironment` both return false
			// under GIT_HOOK, so a hook run shares the no-agent cache rather than
			// opening a third one.
			expect(resolveCacheKey({ CLAUDECODE: "1", GIT_HOOK: "1" })).toBe(resolveCacheKey({}));
		});

		it("honours the ISENTINEL_LINT_CACHE_KEY escape hatch", () => {
			expect.assertions(2);

			expect(resolveCacheKey({ ISENTINEL_LINT_CACHE_KEY: "strict" })).not.toBe(
				resolveCacheKey({}),
			);
			expect(resolveCacheKey({ ISENTINEL_LINT_CACHE_KEY: "strict" })).toBe(
				resolveCacheKey({ ISENTINEL_LINT_CACHE_KEY: "strict" }),
			);
		});
	});

	/**
	 * The files ESLint would re-lint, as the runner counts them: a missing
	 * cache file means every candidate is dirty.
	 *
	 * @param cacheFile - The ESLint cache file to read.
	 * @param files - The candidate files.
	 * @returns The files needing a re-lint.
	 */
	function dirtyFiles(cacheFile: string, files: Array<string>): Array<string> {
		return openCache(cacheFile, false)?.getUpdatedFiles(files) ?? files;
	}

	it("counts all files when the cache is missing", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const fileA = path.join(directory, "a.ts");
		const fileB = path.join(directory, "b.ts");
		fs.writeFileSync(fileA, "const a = 1;");
		fs.writeFileSync(fileB, "const b = 2;");

		expect(dirtyFiles(path.join(directory, "missing"), [fileA, fileB])).toHaveLength(2);
	});

	it("counts only changed and uncached files", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		const cacheFile = path.join(directory, ".eslintcache");
		const fileA = path.join(directory, "a.ts");
		const fileB = path.join(directory, "b.ts");
		fs.writeFileSync(fileA, "const a = 1;");
		fs.writeFileSync(fileB, "const b = 2;");

		const cache = fileEntryCache.createFromFile(cacheFile);
		cache.getFileDescriptor(fileA);
		cache.reconcile();

		// fileA is cached and unchanged; fileB was never seen.
		expect(dirtyFiles(cacheFile, [fileA, fileB])).toHaveLength(1);

		fs.writeFileSync(fileA, "const a = 42;");
		const future = Date.now() / 1000 + 60;
		fs.utimesSync(fileA, future, future);

		expect(dirtyFiles(cacheFile, [fileA, fileB])).toHaveLength(2);
	});

	/**
	 * The version range ESLint declares for one of its own dependencies.
	 *
	 * @param name - The dependency to look up.
	 * @returns The declared semver range.
	 */
	function eslintDependencyRange(name: string): string {
		const manifest = createRequire(`${process.cwd()}/`).resolve("eslint/package.json");
		const parsed: unknown = JSON.parse(fs.readFileSync(manifest, "utf8"));
		const dependencies = isRecord(parsed) ? parsed["dependencies"] : undefined;
		return String(isRecord(dependencies) ? dependencies[name] : undefined);
	}

	it("resolves a file-entry-cache ESLint would load itself", () => {
		expect.assertions(1);

		// The runner and ESLint read and write the same `.eslintcache` files
		// through their own copies of this library, so the runner's copy has to
		// be one ESLint would load itself. A version outside that range writes
		// entries ESLint parses as none, turning every surgical removal into a
		// silent wipe of the whole cache.
		const resolved = getPackageInfoSync("file-entry-cache", { paths: [process.cwd()] });

		expect(satisfies(resolved!.version!, eslintDependencyRange("file-entry-cache"))).toBe(true);
	});

	it("removes one entry from a cache without disturbing the rest", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		const cacheFile = path.join(directory, ".eslintcache");
		const files = ["a.ts", "b.ts", "c.ts"].map((name) => path.join(directory, name));
		for (const file of files) {
			fs.writeFileSync(file, "export const value = 1;");
		}

		const seeded = fileEntryCache.createFromFile(cacheFile);
		for (const file of files) {
			seeded.getFileDescriptor(file);
		}

		seeded.reconcile();

		expect(openCache(cacheFile, false)!.removeEntries([files[0]!])).toBe(1);
		expect(fileEntryCache.createFromFile(cacheFile).cache.keys()).toStrictEqual(files.slice(1));
	});

	it("leaves a changed file dirty after a removal writes the cache", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const cacheFile = path.join(directory, ".eslintcache");
		const edited = path.join(directory, "edited.js");
		const dropped = path.join(directory, "dropped.js");
		fs.writeFileSync(edited, "const a = 1;\n");
		fs.writeFileSync(dropped, "const b = 2;\n");
		fs.writeFileSync(path.join(directory, "eslint.config.mjs"), "export default [];\n");

		lintWithCache(directory, cacheFile);
		fs.writeFileSync(edited, "const a = 42;\n");
		setMtimeInFuture(edited);

		// Asking a cache which files changed restamps every entry it looked at
		// with the file's current size and mtime. Persisting that would leave
		// the edited file looking freshly linted and skip it next run.
		const loaded = openCache(cacheFile, false)!;
		loaded.getUpdatedFiles([edited, dropped]);
		loaded.removeEntries([dropped]);

		expect(openCache(cacheFile, false)!.getUpdatedFiles([edited])).toStrictEqual([edited]);
	});

	it("reports the cached files a check run left messages on", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		const cacheFile = path.join(directory, ".eslintcache");
		const dirty = path.join(directory, "dirty.js");
		const clean = path.join(directory, "clean.js");
		fs.writeFileSync(dirty, "var value = 1;\n");
		fs.writeFileSync(clean, "const value = 1;\n");
		fs.writeFileSync(
			path.join(directory, "eslint.config.mjs"),
			'export default [{ rules: { "no-var": "error" } }];\n',
		);

		// Seeded by ESLint itself: where it puts a file's messages is its own
		// business, and hand-writing the layout here would only assert that the
		// runner agrees with itself.
		lintWithCache(directory, cacheFile);

		const loaded = openCache(cacheFile, false);

		expect(loaded!.filesWithMessages([dirty, clean])).toStrictEqual([dirty]);
		// A file the caller did not ask about is never reported, however dirty
		// its entry: each pass only owns the targets it linted.
		expect(loaded!.filesWithMessages([clean])).toStrictEqual([]);
	});
});

describe("collectRepoFiles lintable set", () => {
	it("collects the TS/JS family plus JSONC, YAML, TOML, Markdown and Lua", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const lintable = [
			"a.ts",
			"b.tsx",
			"c.js",
			"config.json",
			"tsconfig.jsonc",
			"data.json5",
			"ci.yaml",
			"pnpm-workspace.yml",
			"Cargo.toml",
			"README.md",
			"init.lua",
		];
		const excluded = ["notes.txt", "styles.css"];
		for (const name of [...lintable, ...excluded]) {
			fs.writeFileSync(path.join(directory, name), "");
		}

		const files = withoutGitEnvironment(() => collectRepoFiles(directory, ["."]).lintable);
		const collected = files.map((file) => path.basename(file));

		expect(collected.toSorted()).toStrictEqual(lintable.toSorted());
	});
});

describe("oxlintTargets", () => {
	it("keeps the TS/JS family, directories and extensionless paths", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "src"));

		expect(
			oxlintTargets(directory, ["a.ts", "b.tsx", "c.js", "src", "Makefile"]),
		).toStrictEqual(["a.ts", "b.tsx", "c.js", "src", "Makefile"]);
	});

	it("drops non-TS/JS file extensions", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(oxlintTargets(directory, ["pnpm-lock.yaml", "README.md"])).toStrictEqual([]);
	});

	it("drops a gitignored file oxlint would refuse, collapsing an all-ignored set", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		withoutGitEnvironment(() => execFileSync("git", ["init", "-q"], { cwd: directory }));
		fs.writeFileSync(path.join(directory, ".gitignore"), "src/typegen.d.ts\n");

		// The only oxlint-eligible target is the one git ignores, so the set
		// collapses to empty rather than handing oxlint an all-ignored run it
		// exits non-zero on.
		expect(
			withoutGitEnvironment(() => {
				return oxlintTargets(directory, ["pnpm-lock.yaml", "src/typegen.d.ts"]);
			}),
		).toStrictEqual([]);
	});

	it("keeps non-ignored targets alongside an ignored one", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		withoutGitEnvironment(() => execFileSync("git", ["init", "-q"], { cwd: directory }));
		fs.writeFileSync(path.join(directory, ".gitignore"), "src/typegen.d.ts\n");

		expect(
			withoutGitEnvironment(() => {
				return oxlintTargets(directory, ["src/typegen.d.ts", "src/index.ts"]);
			}),
		).toStrictEqual(["src/index.ts"]);
	});

	it("filters nothing outside a git repository", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(
			withoutGitEnvironment(() => oxlintTargets(directory, ["a.ts", "b.ts"])),
		).toStrictEqual(["a.ts", "b.ts"]);
	});
});

describe("splitArgs", () => {
	it("splits on whitespace and respects quotes", () => {
		expect.assertions(3);

		expect(splitArgs("--max-warnings 0")).toStrictEqual(["--max-warnings", "0"]);
		expect(splitArgs("--rule 'no-console: error'")).toStrictEqual([
			"--rule",
			"no-console: error",
		]);
		expect(splitArgs("  ")).toStrictEqual([]);
	});
});

describe("command composition", () => {
	it("composes the oxlint command with type-aware, agents and fix", () => {
		expect.assertions(2);

		const command = composeOxlintCommand(options({ agents: true, fix: true }), {
			oxlintTypeAware: true,
			paths: ["src"],
		});

		expect(command.args).toStrictEqual([
			"--format",
			"agent",
			"--type-aware",
			"--fix",
			"--no-error-on-unmatched-pattern",
			"src",
		]);
		expect(command.env).toStrictEqual({});
	});

	it("omits --type-aware from oxlint when disabled", () => {
		expect.assertions(1);

		const command = composeOxlintCommand(options(), { oxlintTypeAware: false, paths: ["."] });

		expect(command.args).not.toContain("--type-aware");
	});

	// A tracked file the oxlint config ignores (`src/generated/*.ts`) survives
	// `oxlintTargets`, which only sees git's ignores, and leaves oxlint with
	// nothing to lint. Bare, that exits non-zero and fails a hook.
	it("never lets an all-ignored target set fail the oxlint pass", () => {
		expect.assertions(1);

		const command = composeOxlintCommand(options(), {
			oxlintTypeAware: false,
			paths: ["src/generated/oxlint-capabilities.ts"],
		});

		expect(command.args).toStrictEqual([
			"--no-error-on-unmatched-pattern",
			"src/generated/oxlint-capabilities.ts",
		]);
	});

	it("composes the ESLint command with cache location and concurrency", () => {
		expect.assertions(3);

		const command = composeEslintCommand(
			options(),
			baseContext({
				cacheLocation: ".eslintcache-fast",
				concurrency: 4,
				eslintLabel: "fast",
				paths: ["src"],
				typeAwareEnv: "off",
			}),
		);

		expect(command.args).toStrictEqual([
			"--cache",
			"--cache-location",
			".eslintcache-fast",
			"--no-warn-ignored",
			"--concurrency",
			"4",
			"src",
		]);
		expect(command.env).toStrictEqual({ ESLINT_TYPE_AWARE: "off" });
		expect(command.label).toBe("fast");
	});

	it("adds the content cache strategy in CI", () => {
		expect.assertions(2);

		const command = composeEslintCommand(options(), baseContext({ ci: true, concurrency: 2 }));
		const strategyIndex = command.args.indexOf("--cache-strategy");

		expect(strategyIndex).toBeGreaterThan(-1);
		expect(command.args[strategyIndex + 1]).toBe("content");
	});

	it("drops cache flags when caching is disabled", () => {
		expect.assertions(2);

		const command = composeEslintCommand(options({ cache: false }), baseContext({ ci: true }));

		expect(command.args).not.toContain("--cache");
		expect(command.args).not.toContain("--cache-strategy");
	});

	it("adds --fix only for the child the context marks as the fix pass", () => {
		expect.assertions(2);

		// `--fix` belongs to the one narrow child that applies fixes, never to
		// the check children of the same run.
		expect(composeEslintCommand(options({ fix: true }), baseContext()).args).not.toContain(
			"--fix",
		);
		expect(
			composeEslintCommand(options({ fix: true }), baseContext({ fix: true })).args,
		).toContain("--fix");
	});

	it("points ESLint at the agents formatter", () => {
		expect.assertions(1);

		const command = composeEslintCommand(
			options({ agents: true }),
			baseContext({ agentsFormatterPath: "/dist/formatter-agents.mjs" }),
		);
		const formatIndex = command.args.indexOf("--format");

		expect(command.args[formatIndex + 1]).toBe("/dist/formatter-agents.mjs");
	});
});

describe("formatCommandLine", () => {
	it("renders a shell-equivalent line with an env prefix", () => {
		expect.assertions(1);

		const command = composeEslintCommand(
			options(),
			baseContext({
				cacheLocation: ".eslintcache-fast",
				ci: true,
				concurrency: 4,
				typeAwareEnv: "off",
			}),
		);

		expect(formatCommandLine(command)).toBe(
			"ESLINT_TYPE_AWARE=off eslint --cache --cache-location .eslintcache-fast " +
				"--no-warn-ignored --concurrency 4 --cache-strategy content .",
		);
	});

	it("renders oxlint without an env prefix", () => {
		expect.assertions(1);

		const command = composeOxlintCommand(options(), { oxlintTypeAware: true, paths: ["."] });

		expect(formatCommandLine(command)).toBe(
			"oxlint --type-aware --no-error-on-unmatched-pattern .",
		);
	});
});

describe("buildShellCommand", () => {
	it("quotes tokens with spaces per platform", () => {
		expect.assertions(3);

		expect(buildShellCommand("node", "/path/eslint.js", ["."], "linux")).toBe(
			"node /path/eslint.js .",
		);
		expect(buildShellCommand("node", "/a b/eslint.js", ["."], "linux")).toBe(
			"node '/a b/eslint.js' .",
		);
		expect(buildShellCommand("node", "C:/a b/eslint.js", ["."], "win32")).toBe(
			'node "C:/a b/eslint.js" .',
		);
	});

	it("doubles trailing backslashes so they do not escape the closing quote", () => {
		expect.assertions(2);

		// `.\src\` naively quotes to `".\src\"`, whose trailing `\"` cmd.exe
		// reads as an escaped quote — ESLint then receives the literal `.\src"`.
		expect(buildShellCommand("node", "C:/eslint.js", [".\\src\\"], "win32")).toBe(
			'node C:/eslint.js ".\\src\\\\"',
		);
		expect(buildShellCommand("node", "C:/eslint.js", ["C:\\a b\\"], "win32")).toBe(
			'node C:/eslint.js "C:\\a b\\\\"',
		);
	});

	it("doubles backslashes that precede an embedded quote", () => {
		expect.assertions(1);

		expect(buildShellCommand("node", "C:/eslint.js", [String.raw`a\"b`], "win32")).toBe(
			String.raw`node C:/eslint.js "a\\\"b"`,
		);
	});
});

function printLines(
	argv: Array<string>,
	directory: string,
	environment: NodeJS.ProcessEnv = {},
): Array<string> {
	const { commands } = composeInDirectory(argv, directory, { environment });
	return commands.map((command) => formatCommandLine(command));
}

describe("compose --print", () => {
	it("composes the default concurrent two-pass mode plus oxlint", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(printLines([], directory)).toStrictEqual([
			"oxlint --type-aware --no-error-on-unmatched-pattern .",
			`ESLINT_TYPE_AWARE=off eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_FAST)} ` +
				"--no-warn-ignored --concurrency off .",
			`ESLINT_TYPE_AWARE=only eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_TYPE_AWARE)} ` +
				"--no-warn-ignored --concurrency off .",
		]);
	});

	it("composes only the fast pass for --type-aware=off", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(printLines(["--type-aware=off"], directory)).toStrictEqual([
			"oxlint --no-error-on-unmatched-pattern .",
			`ESLINT_TYPE_AWARE=off eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_FAST)} ` +
				"--no-warn-ignored --concurrency off .",
		]);
	});

	it("composes only the typed pass for --type-aware=only", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(printLines(["--type-aware=only"], directory)).toStrictEqual([
			"oxlint --type-aware --no-error-on-unmatched-pattern .",
			`ESLINT_TYPE_AWARE=only eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_TYPE_AWARE)} ` +
				"--no-warn-ignored --concurrency off .",
		]);
	});

	it("composes the agent formatters from the environment alone", () => {
		expect.assertions(3);

		const directory = temporaryDirectory();
		const lines = printLines([], directory, { CLAUDECODE: "1" });

		expect(lines[0]).toContain("--format agent");
		expect(lines.slice(1).every((line) => /--format \S*formatter-agents\.mjs/.test(line))).toBe(
			true,
		);
		expect(
			printLines(["--no-agents"], directory, { CLAUDECODE: "1" }).join("\n"),
		).not.toContain("--format");
	});

	it("composes the full config for the --type-aware=full escape hatch", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(printLines(["--type-aware=full"], directory)).toStrictEqual([
			"oxlint --type-aware --no-error-on-unmatched-pattern .",
			`eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_DEFAULT)} --no-warn-ignored --concurrency off .`,
		]);
	});

	it("composes a single full pass with the content cache strategy in CI", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(printLines([], directory, { CI: "true" })).toStrictEqual([
			"oxlint --type-aware --no-error-on-unmatched-pattern .",
			`eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_DEFAULT, { CI: "true" })} --no-warn-ignored --concurrency off --cache-strategy content .`,
		]);
	});

	it("drops oxlint when no target is a file it can lint", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(printLines(["package.json"], directory)).toStrictEqual([
			`ESLINT_TYPE_AWARE=off eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_FAST)} ` +
				"--no-warn-ignored --concurrency off package.json",
			`ESLINT_TYPE_AWARE=only eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_TYPE_AWARE)} ` +
				"--no-warn-ignored --concurrency off package.json",
		]);
	});

	it("passes oxlint only the targets it can lint", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(printLines(["package.json", "src/index.ts", "docs"], directory)[0]).toBe(
			"oxlint --type-aware --no-error-on-unmatched-pattern src/index.ts docs",
		);
	});

	it("composes a fix run's check children without --fix", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		// The fix child is conditional on what the checks report, so it cannot
		// be composed up front and never appears in a printed plan.
		expect(printLines(["--fix"], directory)).toStrictEqual([
			"oxlint --type-aware --fix --no-error-on-unmatched-pattern .",
			`ESLINT_TYPE_AWARE=off eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_FAST)} ` +
				"--no-warn-ignored --concurrency off .",
			`ESLINT_TYPE_AWARE=only eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_TYPE_AWARE)} ` +
				"--no-warn-ignored --concurrency off .",
		]);
	});
});

describe("plan", () => {
	it("returns the default fast + typed passes as data", () => {
		expect.assertions(5);

		const directory = temporaryDirectory();
		const staged = withoutGitEnvironment(() => {
			return plan(parseArguments([], {}), runContext(directory));
		});

		expect(staged.eager.oxlint).toBe(true);
		expect(staged.eager.oxlintTypeAware).toBe(true);
		expect(staged.eager.passes.map((pass) => pass.descriptor.label)).toStrictEqual([
			"fast",
			"typed",
		]);
		// A read-only plan never auto-skips the typed pass.
		expect(staged.eager.passes.every((pass) => pass.shouldRun)).toBe(true);
		// ...nor stages one: --print runs no builder to move off the path.
		expect(staged.resolveDeferred).toBeUndefined();
	});

	it("plans no ESLint passes for an oxlint-only run", () => {
		expect.assertions(3);

		const directory = temporaryDirectory();
		const staged = withoutGitEnvironment(() => {
			return plan(parseArguments(["--oxlint"], {}), runContext(directory));
		});

		expect(staged.eager.oxlint).toBe(true);
		expect(staged.eager.passes).toStrictEqual([]);
		expect(staged.resolveDeferred).toBeUndefined();
	});

	it("collapses to a single pass for the explicit modes", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		const fast = withoutGitEnvironment(() => {
			return plan(parseArguments(["--type-aware=off"], {}), runContext(directory));
		});
		const full = withoutGitEnvironment(() => {
			return plan(
				parseArguments([], {}),
				runContext(directory, { environment: { CI: "true" } }),
			);
		});

		expect(fast.eager.passes.map((pass) => pass.descriptor.label)).toStrictEqual(["fast"]);
		expect(full.eager.passes.map((pass) => pass.descriptor.label)).toStrictEqual(["eslint"]);
	});
});

describe("plan staging", () => {
	function stagedLabels(
		argv: Array<string>,
		directory: string,
		environment: NodeJS.ProcessEnv = {},
	): { deferred: Array<string>; eager: Array<string> } {
		const staged = withoutGitEnvironment(() => {
			return plan(
				parseArguments(argv, environment),
				runContext(directory, { environment, mutate: true }),
			);
		});

		return {
			deferred: (staged.resolveDeferred?.() ?? []).map((pass) => pass.descriptor.label),
			eager: staged.eager.passes.map((pass) => pass.descriptor.label),
		};
	}

	/**
	 * A fixture whose oxlint child survives the hybrid gate: a fresh status
	 * file and no `eslint.config.*` to make it look stale.
	 *
	 * @returns The fixture directory.
	 */
	function hybridDirectory(): string {
		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "node_modules"));
		writeHybridStatus(directory, true);
		return directory;
	}

	it("holds the typed pass back from a default run", () => {
		expect.assertions(2);

		const { deferred, eager } = stagedLabels([], hybridDirectory());

		expect(eager).toStrictEqual(["fast"]);
		expect(deferred).toStrictEqual(["typed"]);
	});

	it("holds a lone typed or full pass back behind the oxlint child", () => {
		expect.assertions(4);

		const only = stagedLabels(["--type-aware=only"], hybridDirectory());
		const ci = stagedLabels([], hybridDirectory(), { CI: "true" });

		expect(only.eager).toStrictEqual([]);
		expect(only.deferred).toStrictEqual(["typed"]);
		expect(ci.eager).toStrictEqual([]);
		expect(ci.deferred).toStrictEqual(["eslint"]);
	});

	it("never stages --print", () => {
		expect.assertions(1);

		const directory = hybridDirectory();
		const printed = withoutGitEnvironment(() => {
			return plan(parseArguments([], {}), runContext(directory));
		});

		expect(printed.resolveDeferred).toBeUndefined();
	});

	it("never stages a fix run, whose oxlint child is not a sibling", () => {
		expect.assertions(2);

		// A fix run spawns oxlint alone, ahead of the checks, so the fast pass
		// would be the only eager child and could end up alone once the typed
		// pass auto-skips.
		const { deferred, eager } = stagedLabels(["--fix"], hybridDirectory());

		expect(eager).toStrictEqual(["fast", "typed"]);
		expect(deferred).toStrictEqual([]);
	});

	it("never stages a run whose eager half could end up a lone child", () => {
		expect.assertions(2);

		// --eslint drops the oxlint child, leaving the fast pass alone; the typed
		// pass may still auto-skip, which would strip the run back to one child.
		const split = stagedLabels(["--eslint"], hybridDirectory());

		expect(split.eager).toStrictEqual(["fast", "typed"]);
		expect(split.deferred).toStrictEqual([]);
	});

	it("never stages a run with nothing to lint alongside the builder", () => {
		expect.assertions(2);

		// --eslint drops oxlint and =only leaves no syntactic pass, so the typed
		// child is the whole run: holding it back would only delay it.
		const only = stagedLabels(["--eslint", "--type-aware=only"], hybridDirectory());

		expect(only.eager).toStrictEqual(["typed"]);
		expect(only.deferred).toStrictEqual([]);
	});
});

describe("fast pass sizing", () => {
	it("sizes the fast pass from FAST_FILES_PER_WORKER and the typed pass from 300", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		for (const name of ["a.ts", "b.ts", "c.ts"]) {
			fs.writeFileSync(path.join(directory, name), "export const x = 1;\n");
		}

		const { commands } = composeInDirectory([], directory, {
			environment: { FAST_FILES_PER_WORKER: "1", LINT_MAX_WORKERS: "8" },
		});

		// Three dirty files: FAST_FILES_PER_WORKER=1 => 3 fast workers; the
		// typed pass keeps the 300-file default => a single worker (off).
		expect(concurrencyArgument(commands, "fast")).toBe("3");
		expect(concurrencyArgument(commands, "typed")).toBe("off");
	});
});

describe("resolveFastFilesPerWorker", () => {
	it("defaults to 800 and honours FAST_FILES_PER_WORKER", () => {
		expect.assertions(3);

		expect(resolveFastFilesPerWorker({})).toBe(800);
		expect(resolveFastFilesPerWorker({ FAST_FILES_PER_WORKER: "200" })).toBe(200);
		expect(resolveFastFilesPerWorker({ FAST_FILES_PER_WORKER: "0" })).toBe(800);
	});
});

describe("applyPackageJsonBust", () => {
	function writePackageJson(directory: string, value: Record<string, unknown>): void {
		fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify(value));
	}

	const key = resolveCacheKey({});

	function seedCaches(directory: string): void {
		for (const name of ALL_CACHE_FILES) {
			fs.writeFileSync(path.join(directory, cacheFileFor(name, key)), "{}");
		}
	}

	function everyCacheExists(directory: string): boolean {
		return ALL_CACHE_FILES.every((name) => {
			return fs.existsSync(path.join(directory, cacheFileFor(name, key)));
		});
	}

	/**
	 * The cleared-path list this bust must report: the two type-aware caches,
	 * in the order it deletes them. Spelled out rather than read back from
	 * `PACKAGE_RESOLUTION.caches`, which would only assert the code against
	 * itself.
	 *
	 * @param directory - The fixture root.
	 * @param variantKey - The config-variant key whose caches were busted.
	 * @returns The expected `BustOutcome.cleared` value.
	 */
	function typeAwareClearedPaths(directory: string, variantKey: string): Array<string> {
		return [CACHE_FILE_DEFAULT, CACHE_FILE_TYPE_AWARE].map((name) => {
			return path.join(directory, cacheFileFor(name, variantKey));
		});
	}

	/**
	 * Apply the package-resolution bust to a run, hashing its `package.json`
	 * the way the planner does.
	 *
	 * @param run - The run whose variant is busted.
	 * @returns The bust outcome.
	 */
	function bustPackage(run: RunContext): BustOutcome {
		return applyHashBust(run, PACKAGE_RESOLUTION, computePackageJsonHash(run.cwd));
	}

	it("stores the hash without busting on the first run", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		writePackageJson(directory, { exports: "./index.js" });
		seedCaches(directory);

		const outcome = bustPackage(runContext(directory));

		expect(outcome).toStrictEqual({ cleared: [], firstRun: true });
		expect(everyCacheExists(directory)).toBe(true);
	});

	it("deletes the type-aware caches but keeps the fast cache when exports change", () => {
		expect.assertions(4);

		const directory = temporaryDirectory();
		writePackageJson(directory, { exports: "./index.js" });
		bustPackage(runContext(directory));
		seedCaches(directory);

		writePackageJson(directory, { exports: "./other.js" });
		const outcome = bustPackage(runContext(directory));

		expect(outcome).toStrictEqual({
			cleared: typeAwareClearedPaths(directory, key),
			firstRun: false,
		});
		expect(fs.existsSync(path.join(directory, cacheFileFor(CACHE_FILE_TYPE_AWARE, key)))).toBe(
			false,
		);
		expect(fs.existsSync(path.join(directory, cacheFileFor(CACHE_FILE_DEFAULT, key)))).toBe(
			false,
		);
		expect(fs.existsSync(path.join(directory, cacheFileFor(CACHE_FILE_FAST, key)))).toBe(true);
	});

	it("does not bust when only unrelated fields change", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		writePackageJson(directory, { exports: "./index.js", scripts: { build: "tsc" } });
		bustPackage(runContext(directory));
		seedCaches(directory);

		writePackageJson(directory, {
			exports: "./index.js",
			scripts: { build: "tsc --noEmit" },
			version: "9.9.9",
		});
		const outcome = bustPackage(runContext(directory));

		expect(outcome).toStrictEqual({ cleared: [], firstRun: false });
		expect(everyCacheExists(directory)).toBe(true);
	});

	it("lets each variant observe the same bump independently", () => {
		expect.assertions(4);

		const directory = temporaryDirectory();
		const agentEnvironment = { CLAUDECODE: "1" };
		const agentKey = resolveCacheKey(agentEnvironment);
		const agentRun = runContext(directory, { environment: agentEnvironment });
		writePackageJson(directory, { exports: "./index.js" });
		bustPackage(runContext(directory));
		bustPackage(agentRun);

		seedCaches(directory);
		for (const name of ALL_CACHE_FILES) {
			fs.writeFileSync(path.join(directory, cacheFileFor(name, agentKey)), "{}");
		}

		writePackageJson(directory, { exports: "./other.js" });

		// The no-agent run busts only its own caches, and crucially does not
		// consume the bump on the agent variant's behalf: a shared state file
		// would make the second call a no-op and leave the agent's type-aware
		// caches permanently stale.
		expect(bustPackage(runContext(directory))).toStrictEqual({
			cleared: typeAwareClearedPaths(directory, key),
			firstRun: false,
		});
		expect(
			fs.existsSync(path.join(directory, cacheFileFor(CACHE_FILE_TYPE_AWARE, agentKey))),
		).toBe(true);

		expect(bustPackage(agentRun)).toStrictEqual({
			cleared: typeAwareClearedPaths(directory, agentKey),
			firstRun: false,
		});
		expect(
			fs.existsSync(path.join(directory, cacheFileFor(CACHE_FILE_TYPE_AWARE, agentKey))),
		).toBe(false);
	});

	it("hashes resolution fields independent of key order", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const dependencies = { a: "1", b: "2" };
		writePackageJson(directory, { dependencies, exports: "./index.js" });
		const first = computePackageJsonHash(directory);

		// Reverse the insertion order programmatically so the hash, not the
		// literal, is what proves order-independence.
		const reversed = Object.fromEntries(Object.entries(dependencies).reverse());
		writePackageJson(directory, { dependencies: reversed, exports: "./index.js" });
		const second = computePackageJsonHash(directory);

		expect(first).toBe(second);
	});

	it("folds a workspace-root dependency bump into the sub-package hash", () => {
		expect.assertions(1);

		const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-ph-"));
		onTestFinished(() => {
			fs.rmSync(root, { force: true, recursive: true });
		});
		fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
		writePackageJson(root, { dependencies: { shared: "1.0.0" } });
		const app = path.join(root, "packages", "app");
		fs.mkdirSync(app, { recursive: true });
		writePackageJson(app, { exports: "./index.js" });

		const before = computePackageJsonHash(app);

		// The sub-package package.json is untouched; only the hoisted root
		// dependency changes — the combined hash must still move.
		writePackageJson(root, { dependencies: { shared: "2.0.0" } });
		const after = computePackageJsonHash(app);

		expect(before).not.toBe(after);
	});
});

describe("execute", () => {
	it("runs every child to completion and aggregates a non-zero exit", async () => {
		expect.assertions(3);

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-run-"));
		onTestFinished(() => {
			fs.rmSync(directory, { force: true, recursive: true });
		});
		const oxcMarker = path.join(directory, "oxc-ran");
		const eslintMarker = path.join(directory, "eslint-ran");

		// oxlint succeeds but only after a delay; eslint fails immediately. A
		// kill-on-failure would kill oxlint before it writes its marker.
		writeFakeToolBin(
			directory,
			"oxlint",
			`const fs=require("node:fs");setTimeout(()=>{fs.writeFileSync(${JSON.stringify(
				oxcMarker,
			)},"ran");process.exit(0);},250);`,
		);
		writeFakeToolBin(
			directory,
			"eslint",
			`const fs=require("node:fs");fs.writeFileSync(${JSON.stringify(
				eslintMarker,
			)},"ran");process.exit(1);`,
		);

		const code = await execute(
			[
				{ args: [], bin: "oxlint", env: {}, label: "oxc" },
				{ args: [], bin: "eslint", env: {}, label: "eslint" },
			],
			directory,
			false,
		);

		expect(code).toBe(1);
		expect(fs.existsSync(eslintMarker)).toBe(true);
		expect(fs.existsSync(oxcMarker)).toBe(true);
	}, 15_000);
});

describe("executeStaged", () => {
	it("spawns the eager children before it resolves the deferred ones", async () => {
		expect.assertions(3);

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-staged-"));
		onTestFinished(() => {
			fs.rmSync(directory, { force: true, recursive: true });
		});
		const oxcMarker = path.join(directory, "oxc-ran");
		const eslintMarker = path.join(directory, "eslint-ran");

		// oxlint writes its marker immediately; the resolver below asserts the
		// file exists, which can only hold if the child really started first.
		writeFakeToolBin(
			directory,
			"oxlint",
			`const fs=require("node:fs");setTimeout(()=>{fs.writeFileSync(${JSON.stringify(
				oxcMarker,
			)},"ran");process.exit(0);},250);`,
		);
		writeFakeToolBin(
			directory,
			"eslint",
			`const fs=require("node:fs");fs.writeFileSync(${JSON.stringify(
				eslintMarker,
			)},"ran");process.exit(1);`,
		);

		let oxcDoneAtResolve = true;
		const code = await executeStaged(
			[{ args: [], bin: "oxlint", env: {}, label: "oxc" }],
			directory,
			() => {
				oxcDoneAtResolve = fs.existsSync(oxcMarker);
				return [{ args: [], bin: "eslint", env: {}, label: "typed" }];
			},
		);

		// oxlint only writes its marker after 250ms, so the resolver running
		// before it appeared — and the marker existing afterwards — is the
		// eager child linting through the deferred planning step.
		expect(oxcDoneAtResolve).toBe(false);
		expect(fs.existsSync(oxcMarker)).toBe(true);
		expect(code).toBe(1);
	}, 15_000);

	it("skips the deferred group when the resolver plans nothing", async () => {
		expect.assertions(2);

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-staged-"));
		onTestFinished(() => {
			fs.rmSync(directory, { force: true, recursive: true });
		});
		writeFakeToolBin(directory, "oxlint", "process.exit(0);");

		let resolverCalls = 0;
		const code = await executeStaged(
			[{ args: [], bin: "oxlint", env: {}, label: "oxc" }],
			directory,
			() => {
				resolverCalls += 1;
				return [];
			},
		);

		expect(code).toBe(0);
		expect(resolverCalls).toBe(1);
	}, 15_000);
});

function repoFiles(overrides: Partial<RepoFiles> = {}): RepoFiles {
	return {
		bustFiles: [],
		configFiles: [],
		lintable: [],
		outsideCwdTargets: [],
		typeAware: [],
		...overrides,
	};
}

describe("collectFixTargets", () => {
	/**
	 * A pass whose cache records the given files, each carrying a message when
	 * listed in `reported`.
	 *
	 * @param directory - The fixture root the cache file lives in.
	 * @param descriptor - The pass the cache belongs to.
	 * @param linted - Absolute paths the pass linted.
	 * @param reported - Absolute paths whose entry carries a message.
	 * @returns The planned pass, marked as having run.
	 */
	function passWithCache(
		directory: string,
		descriptor: PassDescriptor,
		linted: Array<string>,
		reported: Array<string>,
	): PassPlan {
		const cacheFile = cacheFileFor(descriptor.cacheFileBase, resolveCacheKey({}));
		const cache = fileEntryCache.createFromFile(path.join(directory, cacheFile));
		for (const file of linted) {
			// `reconcile` drops any entry whose file is gone, so the fixture has
			// to exist on disk for its cached verdict to survive.
			fs.writeFileSync(file, "export const value = 1;");
			cache.getFileDescriptor(file).meta.data = {
				results: { messages: reported.includes(file) ? [{ ruleId: "no-op" }] : [] },
			};
		}

		cache.reconcile();
		return {
			cacheFile,
			concurrency: "off",
			descriptor,
			shouldRun: true,
			skipReason: undefined,
		};
	}

	it("unions the files every pass that ran reported a message on", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const readme = path.join(directory, "README.md");
		const service = path.join(directory, "service.ts");
		const clean = path.join(directory, "clean.ts");

		const passes = [
			passWithCache(directory, FAST_PASS, [readme, service, clean], [readme]),
			passWithCache(directory, TYPED_PASS, [service, clean], [service]),
		];

		expect(
			collectFixTargets(
				passes,
				runContext(directory),
				repoFiles({ lintable: [readme, service, clean], typeAware: [service, clean] }),
			),
		).toStrictEqual([readme, service]);
	});

	it("reports nothing when every pass came back clean", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const service = path.join(directory, "service.ts");
		const passes = [passWithCache(directory, FAST_PASS, [service], [])];

		expect(
			collectFixTargets(
				passes,
				runContext(directory),
				repoFiles({ lintable: [service], typeAware: [service] }),
			),
		).toStrictEqual([]);
	});

	/**
	 * The inputs a `--fix` run hands the fix child, with the pieces each test
	 * varies.
	 *
	 * @param overrides - The files and options to plan against.
	 * @returns The composed inputs.
	 */
	function fixInputs(overrides: Partial<FixInputs> = {}): FixInputs {
		return {
			agentsFormatterPath: "",
			files: repoFiles(),
			limits: { filesPerWorker: 20, maxWorkers: 4, typedMaxWorkers: 2 },
			options: options({ fix: true, paths: ["src"] }),
			...overrides,
		};
	}

	it("falls back to the run's paths when --no-cache leaves no verdict", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const passes = [passWithCache(directory, FAST_PASS, [], [])];
		const inputs = fixInputs({
			options: options({ cache: false, fix: true, paths: ["src"] }),
		});

		expect(planFixChild(passes, runContext(directory), inputs)!.args.at(-1)).toBe("src");
	});

	it("still lints an outside-cwd target after clean checks", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const passes = [passWithCache(directory, FAST_PASS, [], [])];

		// The cwd-relative listing the verdict is looked up against cannot see
		// a target outside cwd, so no verdict covers it — narrowing it away
		// would mean never fixing it.
		const child = planFixChild(
			passes,
			runContext(directory),
			fixInputs({ files: repoFiles({ outsideCwdTargets: ["../sibling"] }) }),
		);

		expect(child!.args.at(-1)).toBe("../sibling");
	});

	it("keeps the narrowing for the in-cwd half of a mixed run", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const dirty = path.join(directory, "dirty.ts");
		const clean = path.join(directory, "clean.ts");
		const passes = [passWithCache(directory, FAST_PASS, [dirty, clean], [dirty])];

		const child = planFixChild(
			passes,
			runContext(directory),
			fixInputs({
				files: repoFiles({
					lintable: [dirty, clean],
					outsideCwdTargets: ["../sibling"],
				}),
				options: options({ fix: true, paths: ["src", "../sibling"] }),
			}),
		);

		expect(child!.args.slice(-2)).toStrictEqual([dirty, "../sibling"]);
	});

	it("denies the cache to a child carrying a target no verdict covers", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const passes = [passWithCache(directory, FAST_PASS, [], [])];

		// A raw target names no file the cache can be invalidated by path, so a
		// stale clean entry would let ESLint skip the very file it was handed.
		const child = planFixChild(
			passes,
			runContext(directory),
			fixInputs({ files: repoFiles({ outsideCwdTargets: ["../sibling"] }) }),
		);

		expect(child!.args).not.toContain("--cache");
	});

	it("drops the full-config cache entry of every file it hands the child", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const dirty = path.join(directory, "dirty.ts");
		const passes = [passWithCache(directory, FAST_PASS, [dirty], [dirty])];
		const fullCache = path.join(
			directory,
			cacheFileFor(CACHE_FILE_DEFAULT, resolveCacheKey({})),
		);
		seedFileCache(fullCache, [dirty]);

		planFixChild(
			passes,
			runContext(directory),
			fixInputs({ files: repoFiles({ lintable: [dirty] }) }),
		);

		expect(openCache(fullCache, false)!.getUpdatedFiles([dirty])).toStrictEqual([dirty]);
	});

	it("still reads the cache of an auto-skipped pass", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const service = path.join(directory, "service.ts");
		const skipped = passWithCache(directory, TYPED_PASS, [service], [service]);

		// The pass skipped because nothing type-relevant changed, so its cached
		// verdict is the current one. Ignoring it would leave a standing fixable
		// error unfixed until something unrelated moved.
		expect(
			collectFixTargets(
				[{ ...skipped, shouldRun: false }],
				runContext(directory),
				repoFiles({ lintable: [service], typeAware: [service] }),
			),
		).toStrictEqual([service]);
	});
});

function setMtimeInPast(filePath: string): void {
	const past = Date.now() / 1000 - 60;
	fs.utimesSync(filePath, past, past);
}

function setMtimeInFuture(filePath: string): void {
	const future = Date.now() / 1000 + 60;
	fs.utimesSync(filePath, future, future);
}

describe("hybrid status file", () => {
	it("only writes when node_modules exists", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		writeHybridStatus(directory, true);

		expect(fs.existsSync(hybridStatusPath(directory))).toBe(false);

		fs.mkdirSync(path.join(directory, "node_modules"));
		writeHybridStatus(directory, true);

		expect(readHybridStatus(directory)).toStrictEqual({ oxlint: true });
	});

	it("refreshes the mtime on identical content and rewrites on change", () => {
		expect.assertions(3);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "node_modules"));
		writeHybridStatus(directory, false);
		setMtimeInPast(hybridStatusPath(directory));
		const before = fs.statSync(hybridStatusPath(directory)).mtimeMs;

		// Identical content: the file is not rewritten, but its mtime is
		// refreshed so the CLI's freshness check keeps passing after a config
		// touch (otherwise the ~3s probe would run on every later lint).
		writeHybridStatus(directory, false);

		expect(fs.statSync(hybridStatusPath(directory)).mtimeMs).toBeGreaterThan(before);
		expect(readHybridStatus(directory)).toStrictEqual({ oxlint: false });

		// Changed content: the file is rewritten.
		writeHybridStatus(directory, true);

		expect(readHybridStatus(directory)).toStrictEqual({ oxlint: true });
	});

	it("swallows write failures", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "node_modules"));
		// `.cache` as a file makes creating the isentinel-lint subdir throw.
		fs.writeFileSync(path.join(directory, "node_modules", ".cache"), "");

		expect(() => {
			writeHybridStatus(directory, true);
		}).not.toThrow();
		expect(readHybridStatus(directory)).toBeUndefined();
	});

	it("returns undefined for malformed status content", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const statusPath = hybridStatusPath(directory);
		fs.mkdirSync(path.dirname(statusPath), { recursive: true });
		fs.writeFileSync(statusPath, "not json");

		expect(readHybridStatus(directory)).toBeUndefined();
	});
});

describe("resolveOxlintRun", () => {
	function freshConfig(directory: string): string {
		const config = path.join(directory, "eslint.config.ts");
		fs.writeFileSync(config, "export default []");
		setMtimeInPast(config);
		return config;
	}

	it("drops oxlint with a warning when a fresh status is non-hybrid", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "node_modules"));
		const config = freshConfig(directory);
		writeHybridStatus(directory, false);

		let probeCalls = 0;
		function probe(): HybridStatus {
			probeCalls += 1;
			return { oxlint: false };
		}

		const decision = resolveOxlintRun(
			runContext(directory, { mutate: true }),
			{ files: repoFiles({ configFiles: [config] }), runEslint: true, runOxlint: true },
			probe,
		);

		expect(decision).toStrictEqual({ reason: NON_HYBRID_WARNING, run: false });
		expect(probeCalls).toBe(0);
	});

	it("runs both engines when a fresh status is hybrid, without probing", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "node_modules"));
		const config = freshConfig(directory);
		writeHybridStatus(directory, true);

		let probeCalls = 0;
		function probe(): HybridStatus {
			probeCalls += 1;
			return { oxlint: false };
		}

		const decision = resolveOxlintRun(
			runContext(directory, { mutate: true }),
			{ files: repoFiles({ configFiles: [config] }), runEslint: true, runOxlint: true },
			probe,
		);

		expect(decision).toStrictEqual({ reason: undefined, run: true });
		expect(probeCalls).toBe(0);
	});

	it("probes when the status is stale and persists the probe result", () => {
		expect.assertions(3);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "node_modules"));
		// Status first (older), then a newer config makes it stale.
		writeHybridStatus(directory, true);
		const config = path.join(directory, "eslint.config.ts");
		fs.writeFileSync(config, "export default []");
		setMtimeInFuture(config);

		let probeCalls = 0;
		function probe(): HybridStatus {
			probeCalls += 1;
			return { oxlint: false };
		}

		const decision = resolveOxlintRun(
			runContext(directory, { mutate: true }),
			{
				files: repoFiles({
					configFiles: [config],
					typeAware: [path.join(directory, "a.ts")],
				}),
				runEslint: true,
				runOxlint: true,
			},
			probe,
		);

		expect(probeCalls).toBe(1);
		expect(decision).toStrictEqual({ reason: NON_HYBRID_WARNING, run: false });
		expect(readHybridStatus(directory)).toStrictEqual({ oxlint: false });
	});

	it("fails open when the probe cannot determine the status", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "node_modules"));

		const decision = resolveOxlintRun(
			runContext(directory, { mutate: true }),
			{
				files: repoFiles({ typeAware: [path.join(directory, "a.ts")] }),
				runEslint: true,
				runOxlint: true,
			},
			() => {},
		);

		expect(decision).toStrictEqual({ reason: HYBRID_UNKNOWN_WARNING, run: true });
	});

	it("skips the check for explicit single-tool runs", () => {
		expect.assertions(3);

		const directory = temporaryDirectory();
		let probeCalls = 0;
		function probe(): HybridStatus {
			probeCalls += 1;
			return { oxlint: false };
		}

		// --oxlint leaves runEslint false; --eslint leaves runOxlint false.
		const oxlintOnly = resolveOxlintRun(
			runContext(directory, { mutate: true }),
			{ files: repoFiles(), runEslint: false, runOxlint: true },
			probe,
		);
		const eslintOnly = resolveOxlintRun(
			runContext(directory, { mutate: true }),
			{ files: repoFiles(), runEslint: true, runOxlint: false },
			probe,
		);

		expect(oxlintOnly).toStrictEqual({ reason: undefined, run: true });
		expect(eslintOnly).toStrictEqual({ reason: undefined, run: false });
		expect(probeCalls).toBe(0);
	});

	it("never probes or writes for a read-only (--print) plan", () => {
		expect.assertions(3);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "node_modules"));
		const config = path.join(directory, "eslint.config.ts");
		fs.writeFileSync(config, "export default []");
		setMtimeInFuture(config);

		let probeCalls = 0;
		function probe(): HybridStatus {
			probeCalls += 1;
			return { oxlint: false };
		}

		const decision = resolveOxlintRun(
			runContext(directory, { mutate: false }),
			{
				files: repoFiles({
					configFiles: [config],
					typeAware: [path.join(directory, "a.ts")],
				}),
				runEslint: true,
				runOxlint: true,
			},
			probe,
		);

		// Stale status, but --print never probes: assume hybrid, print
		// unchanged.
		expect(decision).toStrictEqual({ reason: undefined, run: true });
		expect(probeCalls).toBe(0);
		expect(fs.existsSync(hybridStatusPath(directory))).toBe(false);
	});
});

describe("plan hybrid integration", () => {
	it("drops the oxlint child for a fresh non-hybrid status", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "node_modules"));
		const config = path.join(directory, "eslint.config.ts");
		fs.writeFileSync(config, "export default []");
		fs.writeFileSync(path.join(directory, "a.ts"), "export const x = 1;\n");
		setMtimeInPast(config);
		writeHybridStatus(directory, false);

		const { commands, notice } = composeInDirectory([], directory, { mutate: true });

		expect(commands.some((command) => command.label === "oxc")).toBe(false);
		expect(notice).toContain(NON_HYBRID_WARNING);
	});
});

function writeFakeToolBin(directory: string, name: string, body: string): void {
	const packageDirectory = path.join(directory, "node_modules", name);
	fs.mkdirSync(packageDirectory, { recursive: true });
	fs.writeFileSync(
		path.join(packageDirectory, "package.json"),
		JSON.stringify({ name, bin: { [name]: "bin.js" }, version: "0.0.0" }),
	);
	fs.writeFileSync(path.join(packageDirectory, "bin.js"), body);
}

// A no-op eslint bin so a degraded (oxlint-dropped) run completes instead of
// failing to resolve the real binary. oxlint-tsgolint is never installed in
// these temp dirs, so the tsgolint check sees it absent.
const NOOP_ESLINT_BIN = "process.exit(0);";

describe("runLint tsgolint check ordering", () => {
	it("does not error without oxlint-tsgolint when the hybrid gate drops oxlint", async () => {
		expect.assertions(1);

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-pre-"));
		onTestFinished(() => {
			fs.rmSync(directory, { force: true, recursive: true });
		});
		fs.mkdirSync(path.join(directory, "node_modules"), { recursive: true });
		writeFakeToolBin(directory, "eslint", NOOP_ESLINT_BIN);
		// A fresh non-hybrid status drops oxlint, so no oxlint child carries
		// --type-aware and the check must not fire.
		writeHybridStatus(directory, false);

		const code = await withoutGitEnvironment(async () => runLint([], directory, {}));

		expect(code).toBe(0);
	});

	it("still errors for an explicit --oxlint run without oxlint-tsgolint", async () => {
		expect.assertions(1);

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-pre-"));
		onTestFinished(() => {
			fs.rmSync(directory, { force: true, recursive: true });
		});

		await expect(
			withoutGitEnvironment(async () => runLint(["--oxlint"], directory, {})),
		).rejects.toThrow(/oxlint-tsgolint is not installed/);
	});

	it("prints without erroring when oxlint-tsgolint is absent", async () => {
		expect.assertions(2);

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-pre-"));
		const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
		onTestFinished(() => {
			spy.mockRestore();
			fs.rmSync(directory, { force: true, recursive: true });
		});
		const code = await withoutGitEnvironment(async () => runLint(["--print"], directory, {}));

		expect(code).toBe(0);

		// --print returns before the check, so it never throws even though
		// the composed oxlint child carries --type-aware.
		const printed = spy.mock.calls.map((call) => String(call[0])).join("");

		expect(printed).toContain("oxlint --type-aware");
	});
});

describe("runLint --fix", () => {
	/**
	 * A fixture whose ESLint children are fakes that record their argv, with a
	 * warm fast cache reporting a message on one file.
	 *
	 * @param reported - Fixture-relative paths the cache reports a message on.
	 * @returns The fixture root and the argv log path.
	 */
	function fixFixture(reported: Array<string>): { argvLog: string; directory: string } {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-fix-run-"));
		onTestFinished(() => {
			fs.rmSync(directory, { force: true, recursive: true });
		});
		fs.mkdirSync(path.join(directory, "node_modules"), { recursive: true });
		writeHybridStatus(directory, true);

		const argvLog = path.join(directory, "argv.log");
		const body =
			'const fs=require("node:fs");' +
			'const line=process.argv.slice(2).join(" ")+String.fromCharCode(10);' +
			`fs.appendFileSync(${JSON.stringify(argvLog)},line);` +
			"process.exit(0);";
		writeFakeToolBin(directory, "oxlint", body);
		writeFakeToolBin(directory, "eslint", body);

		const cacheFile = path.join(directory, keyedCacheFile(CACHE_FILE_FAST));
		const cache = fileEntryCache.createFromFile(cacheFile);
		for (const relative of reported) {
			const file = path.join(directory, relative);
			fs.writeFileSync(file, "export const value = 1;");
			cache.getFileDescriptor(file).meta.data = {
				results: { messages: [{ ruleId: "no-op" }] },
			};
		}

		cache.reconcile();
		return { argvLog, directory };
	}

	/**
	 * Every child argv line a run produced, in spawn order.
	 *
	 * @param argvLog - The log the fake bins append to.
	 * @returns The recorded argv lines.
	 */
	function spawnedArgv(argvLog: string): Array<string> {
		return fs.existsSync(argvLog)
			? fs.readFileSync(argvLog, "utf8").trim().split("\n").filter(Boolean)
			: [];
	}

	it("spawns no fix child when the checks reported nothing", async () => {
		expect.assertions(2);

		const { argvLog, directory } = fixFixture([]);
		const code = await withoutGitEnvironment(async () => {
			return runLint(["--fix", "--no-oxlint-type-aware"], directory, {});
		});

		expect(code).toBe(0);
		expect(spawnedArgv(argvLog).filter((line) => line.includes("--fix"))).toStrictEqual([
			"--fix --no-error-on-unmatched-pattern .",
		]);
	});

	it("hands the fix child only the files the checks reported", async () => {
		expect.assertions(2);

		const { argvLog, directory } = fixFixture(["dirty.ts"]);
		const code = await withoutGitEnvironment(async () => {
			return runLint(["--fix", "--no-oxlint-type-aware"], directory, {});
		});
		const fixChild = spawnedArgv(argvLog).at(-1);

		expect(code).toBe(0);
		expect(fixChild).toBe(
			`--cache --cache-location ${keyedCacheFile(CACHE_FILE_DEFAULT)} ` +
				`--no-warn-ignored --concurrency off --fix ${path.join(directory, "dirty.ts")}`,
		);
	});
});

describe("target normalization", () => {
	it("relativizes an absolute target under cwd and matches its files", () => {
		expect.assertions(2);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "src"));
		fs.writeFileSync(path.join(directory, "src", "a.ts"), "export const a = 1;\n");
		fs.writeFileSync(path.join(directory, "b.ts"), "export const b = 2;\n");

		const files = withoutGitEnvironment(() => {
			return collectRepoFiles(directory, [path.join(directory, "src")]);
		});

		expect(files.lintable.map((file) => path.basename(file))).toStrictEqual(["a.ts"]);
		expect(files.outsideCwdTargets).toStrictEqual([]);
	});

	it("flags a relative target that escapes cwd", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		fs.writeFileSync(path.join(directory, "a.ts"), "export const a = 1;\n");

		const files = withoutGitEnvironment(() => collectRepoFiles(directory, ["../sibling"]));

		expect(files.outsideCwdTargets).toStrictEqual(["../sibling"]);
	});

	it("flags an absolute target outside cwd", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const outside = temporaryDirectory();

		const files = withoutGitEnvironment(() => collectRepoFiles(directory, [outside]));

		expect(files.outsideCwdTargets).toStrictEqual([outside]);
	});

	it("still treats './' and trailing slashes as match-all in-cwd targets", () => {
		expect.assertions(4);

		const directory = temporaryDirectory();
		fs.mkdirSync(path.join(directory, "src"));
		fs.writeFileSync(path.join(directory, "src", "a.ts"), "export const a = 1;\n");

		const dot = withoutGitEnvironment(() => collectRepoFiles(directory, ["./"]));
		const trailing = withoutGitEnvironment(() => collectRepoFiles(directory, ["src/"]));

		expect(dot.lintable).toHaveLength(1);
		expect(dot.outsideCwdTargets).toStrictEqual([]);
		expect(trailing.lintable).toHaveLength(1);
		expect(trailing.outsideCwdTargets).toStrictEqual([]);
	});
});

describe("workspace root", () => {
	it("returns the nearest ancestor bearing a marker", () => {
		expect.assertions(1);

		const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-ws-"));
		onTestFinished(() => {
			fs.rmSync(root, { force: true, recursive: true });
		});
		fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
		const app = path.join(root, "packages", "app");
		fs.mkdirSync(app, { recursive: true });

		expect(findWorkspaceRoot(app)).toBe(root);
	});
});

describe("ancestor cache-bust collection", () => {
	it("folds workspace-root bust files into a sub-package run", () => {
		expect.assertions(2);

		const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-anc-"));
		onTestFinished(() => {
			fs.rmSync(root, { force: true, recursive: true });
		});
		fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
		fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
		fs.writeFileSync(path.join(root, "tsconfig.json"), "{}");
		const app = path.join(root, "packages", "app");
		fs.mkdirSync(app, { recursive: true });
		fs.writeFileSync(path.join(app, "a.ts"), "export const a = 1;\n");

		const files = withoutGitEnvironment(() => collectRepoFiles(app, ["."]));

		expect(files.bustFiles).toContain(path.join(root, "pnpm-lock.yaml"));
		expect(files.bustFiles).toContain(path.join(root, "tsconfig.json"));
	});

	it("collects nothing extra when cwd is itself the workspace root", () => {
		expect.assertions(1);

		const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-anc-"));
		onTestFinished(() => {
			fs.rmSync(root, { force: true, recursive: true });
		});
		fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
		fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

		const files = withoutGitEnvironment(() => collectRepoFiles(root, ["."]));

		// The root lockfile comes from the in-cwd scan, not doubled by the
		// ancestor walk.
		const lockfiles = files.bustFiles.filter(
			(file) => path.basename(file) === "pnpm-lock.yaml",
		);

		expect(lockfiles).toHaveLength(1);
	});
});

describe("full-pass env hygiene", () => {
	it("explicitly clears ESLINT_TYPE_AWARE for the full pass so an inherited value cannot leak", () => {
		expect.assertions(3);

		const command = composeEslintCommand(
			options({ typeAware: "full" }),
			baseContext({ eslintLabel: "eslint", typeAwareEnv: undefined }),
		);

		expect(Object.hasOwn(command.env, "ESLINT_TYPE_AWARE")).toBe(true);
		expect(command.env["ESLINT_TYPE_AWARE"]).toBeUndefined();

		// Merged over an inherited value, the undefined entry removes the key
		// (Node drops undefined env entries at spawn time).
		const merged: Record<string, string | undefined> = {
			ESLINT_TYPE_AWARE: "only",
			...command.env,
		};

		expect(merged["ESLINT_TYPE_AWARE"]).toBeUndefined();
	});

	it("keeps setting ESLINT_TYPE_AWARE for the fast and typed passes", () => {
		expect.assertions(2);

		expect(
			composeEslintCommand(options(), baseContext({ typeAwareEnv: "off" })).env,
		).toStrictEqual({ ESLINT_TYPE_AWARE: "off" });
		expect(
			composeEslintCommand(options(), baseContext({ typeAwareEnv: "only" })).env,
		).toStrictEqual({ ESLINT_TYPE_AWARE: "only" });
	});
});

describe("explicit --type-aware selection in CI", () => {
	it("keeps an explicit --type-aware=only pass in CI with the content cache strategy", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(printLines(["--type-aware=only"], directory, { CI: "true" })).toStrictEqual([
			"oxlint --type-aware --no-error-on-unmatched-pattern .",
			`ESLINT_TYPE_AWARE=only eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_TYPE_AWARE, { CI: "true" })} ` +
				"--no-warn-ignored --concurrency off --cache-strategy content .",
		]);
	});

	it("keeps an explicit --type-aware=off pass in CI", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();

		expect(printLines(["--type-aware=off"], directory, { CI: "true" })).toStrictEqual([
			"oxlint --no-error-on-unmatched-pattern .",
			`ESLINT_TYPE_AWARE=off eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_FAST, { CI: "true" })} ` +
				"--no-warn-ignored --concurrency off --cache-strategy content .",
		]);
	});
});

describe("bust-before-size ordering", () => {
	it("clears every cache up front so an earlier pass is not under-provisioned", () => {
		expect.assertions(1);

		const directory = temporaryDirectory();
		const sources = ["a.ts", "b.ts", "c.ts"].map((name) => path.join(directory, name));
		for (const source of sources) {
			fs.writeFileSync(source, "export const x = 1;\n");
		}

		const configFile = path.join(directory, "eslint.config.ts");
		fs.writeFileSync(configFile, "export default []");

		const fastCache = path.join(directory, CACHE_FILE_FAST);
		const typedCache = path.join(directory, CACHE_FILE_TYPE_AWARE);
		seedFileCache(fastCache, sources);
		seedFileCache(typedCache, sources);

		// Order mtimes: typed cache oldest, config in the middle (the bust
		// reference), fast cache newest. So the fast cache is fresh and only
		// the typed cache is stale — yet the fix must clear BOTH before
		// sizing so the fast pass is provisioned for all the re-linted files.
		const now = Date.now() / 1000;
		fs.utimesSync(typedCache, now - 120, now - 120);
		fs.utimesSync(configFile, now - 60, now - 60);
		fs.utimesSync(fastCache, now, now);

		const { commands } = composeInDirectory([], directory, {
			environment: { FAST_FILES_PER_WORKER: "1", LINT_MAX_WORKERS: "8" },
			mutate: true,
		});

		// Every lintable file (three sources plus eslint.config.ts) is dirty
		// after the up-front clear => four fast workers at one file per
		// worker. Without the fix the fast pass reads its fresh cache, sees
		// only the uncached config file (one dirty) and sizes to "off".
		expect(concurrencyArgument(commands, "fast")).toBe("4");
	});
});

describe("parseHybridPrintConfig", () => {
	it("reads the marker through leading log noise", () => {
		expect.assertions(2);

		expect(
			parseHybridPrintConfig('startup log\n{"settings":{"isentinel/oxlint":true}}'),
		).toStrictEqual({ oxlint: true });
		expect(parseHybridPrintConfig('noise {"settings":{}} trailing')).toStrictEqual({
			oxlint: false,
		});
	});

	it("returns undefined when there is no JSON object", () => {
		expect.assertions(2);

		expect(parseHybridPrintConfig("not json at all")).toBeUndefined();
		expect(parseHybridPrintConfig("")).toBeUndefined();
	});
});

describe("buildShellCommand percent guard", () => {
	it("refuses a % token on the Windows shell path but quotes it on POSIX", () => {
		expect.assertions(2);

		expect(() => buildShellCommand("node", "/path/eslint.js", ["%PATH%"], "win32")).toThrow(
			CliError,
		);
		expect(buildShellCommand("node", "/path/eslint.js", ["50%"], "linux")).toBe(
			"node /path/eslint.js '50%'",
		);
	});
});
