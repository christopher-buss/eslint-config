// cspell:words typeaware lintable mtimes CLAUDECODE
import fileEntryCache from "file-entry-cache";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, expect, it, vi } from "vitest";

import { resolveCacheKey } from "../src/lint-cli/cache-key.ts";
import {
	clearAllCaches,
	isCacheBusted,
	listDirtyFiles,
	sweepStaleCaches,
} from "../src/lint-cli/cache.ts";
import {
	buildShellCommand,
	composeEslintCommand,
	composeOxlintCommand,
	formatCommandLine,
	splitArgs,
} from "../src/lint-cli/command.ts";
import {
	computeWorkerCount,
	resolveFastFilesPerWorker,
	resolveWorkerLimits,
} from "../src/lint-cli/concurrency.ts";
import {
	ALL_CACHE_FILES,
	CACHE_FILE_DEFAULT,
	CACHE_FILE_FAST,
	CACHE_FILE_TYPE_AWARE,
	cacheFileFor,
} from "../src/lint-cli/constants.ts";
import { collectLintableFiles, collectRepoFiles } from "../src/lint-cli/files.ts";
import type { RepoFiles } from "../src/lint-cli/files.ts";
import {
	hybridStatusPath,
	readHybridStatus,
	writeHybridStatus,
} from "../src/lint-cli/hybrid-status.ts";
import type { HybridStatus } from "../src/lint-cli/hybrid-status.ts";
import {
	HYBRID_UNKNOWN_WARNING,
	NON_HYBRID_WARNING,
	parseHybridPrintConfig,
	resolveOxlintRun,
} from "../src/lint-cli/hybrid.ts";
import { parseArguments } from "../src/lint-cli/options.ts";
import {
	applyPackageJsonBust,
	computePackageJsonHash,
	packageHashStatePath,
} from "../src/lint-cli/package-hash.ts";
import { composeCommands, plan, runConcurrent, runLint } from "../src/lint-cli/run.ts";
import type { ChildCommand, ComposeContext, LintCliOptions } from "../src/lint-cli/types.ts";
import { CliError } from "../src/lint-cli/types.ts";
import { findWorkspaceRoot } from "../src/lint-cli/workspace.ts";
import { withoutGitEnvironment } from "./without-git.ts";

function baseContext(overrides: Partial<ComposeContext> = {}): ComposeContext {
	return {
		agentsFormatterPath: "/dist/formatter-agents.mjs",
		cacheLocation: ".eslintcache",
		ci: false,
		concurrency: "off",
		eslintLabel: "eslint",
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

function withTemporaryDirectory(run: (directory: string) => void): void {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-"));

	try {
		run(directory);
	} finally {
		fs.rmSync(directory, { force: true, recursive: true });
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
	const cache = fileEntryCache.create(path.basename(cacheFile), path.dirname(cacheFile), false);
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
		expect.hasAssertions();

		expect(parseArguments([]).paths).toStrictEqual(["."]);
	});

	it("keeps explicit paths", () => {
		expect.hasAssertions();

		expect(parseArguments(["src", "test"]).paths).toStrictEqual(["src", "test"]);
	});

	it("errors when --eslint and --oxlint are combined", () => {
		expect.hasAssertions();

		expect(() => parseArguments(["--eslint", "--oxlint"])).toThrow(CliError);
	});

	it("errors when --fix is combined with --type-aware", () => {
		expect.hasAssertions();

		expect(() => parseArguments(["--fix", "--type-aware=only"])).toThrow(
			/Cannot combine --fix with --type-aware/,
		);
	});

	it("errors on unknown flags", () => {
		expect.hasAssertions();

		expect(() => parseArguments(["--nope"])).toThrow(CliError);
	});

	it("errors on invalid --concurrency", () => {
		expect.hasAssertions();

		expect(() => parseArguments(["--concurrency", "banana"])).toThrow(/Invalid --concurrency/);
	});

	it("accepts numeric and off concurrency overrides", () => {
		expect.hasAssertions();

		expect(parseArguments(["--concurrency", "6"]).concurrency).toBe(6);
		expect(parseArguments(["--concurrency", "off"]).concurrency).toBe("off");
	});

	it("errors when bare -- passthrough is used without a single tool", () => {
		expect.hasAssertions();

		expect(() => parseArguments(["--", "--foo"])).toThrow(/single tool/);
		expect(() => parseArguments(["--eslint", "--oxlint", "--", "--foo"])).toThrow(CliError);
	});

	it("forwards -- passthrough to the selected tool", () => {
		expect.hasAssertions();

		expect(parseArguments(["--oxlint", "--", "--deny", "all"]).oxlintArgs).toStrictEqual([
			"--deny",
			"all",
		]);
		expect(parseArguments(["--eslint", "--", "--max-warnings", "0"]).eslintArgs).toStrictEqual([
			"--max-warnings",
			"0",
		]);
	});

	it("splits dash-prefixed per-tool extra args", () => {
		expect.hasAssertions();

		const parsed = parseArguments([
			"--eslint-args",
			"--max-warnings 0",
			"--oxlint-args=--quiet",
		]);

		expect(parsed.eslintArgs).toStrictEqual(["--max-warnings", "0"]);
		expect(parsed.oxlintArgs).toStrictEqual(["--quiet"]);
	});

	it("parses cache and type-aware toggles", () => {
		expect.hasAssertions();

		const parsed = parseArguments(["--no-cache", "--no-oxlint-type-aware", "--type-aware=off"]);

		expect(parsed.cache).toBe(false);
		expect(parsed.oxlintTypeAware).toBe(false);
		expect(parsed.typeAware).toBe("off");
	});
});

describe("computeWorkerCount", () => {
	it("returns off for zero or single-worker workloads", () => {
		expect.hasAssertions();

		expect(workerCount(0, 350, 8)).toBe("off");
		expect(workerCount(350, 350, 8)).toBe("off");
	});

	it("scales with the dirty count", () => {
		expect.hasAssertions();

		expect(workerCount(400, 350, 8)).toBe(2);
		expect(workerCount(1400, 350, 8)).toBe(4);
	});

	it("caps at maxWorkers", () => {
		expect.hasAssertions();

		expect(workerCount(100_000, 350, 3)).toBe(3);
	});

	it("returns off when the cap is below two", () => {
		expect.hasAssertions();

		expect(workerCount(100_000, 350, 1)).toBe("off");
	});
});

describe("resolveWorkerLimits", () => {
	it("defaults to 350 files per worker and a quarter of the CPUs", () => {
		expect.hasAssertions();

		expect(resolveWorkerLimits({}, 16)).toStrictEqual({ filesPerWorker: 350, maxWorkers: 4 });
	});

	it("honours env overrides", () => {
		expect.hasAssertions();

		const limits = resolveWorkerLimits({ FILES_PER_WORKER: "200", LINT_MAX_WORKERS: "6" }, 16);

		expect(limits).toStrictEqual({ filesPerWorker: 200, maxWorkers: 6 });
	});

	it("ignores invalid env overrides", () => {
		expect.hasAssertions();

		const limits = resolveWorkerLimits({ FILES_PER_WORKER: "0", LINT_MAX_WORKERS: "x" }, 16);

		expect(limits).toStrictEqual({ filesPerWorker: 350, maxWorkers: 4 });
	});
});

describe("cache helpers", () => {
	it("detects a bust file newer than the cache", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const cacheFile = path.join(directory, ".eslintcache");
			const configFile = path.join(directory, "eslint.config.ts");
			fs.writeFileSync(cacheFile, "{}");
			fs.writeFileSync(configFile, "export default []");
			const future = Date.now() / 1000 + 60;
			fs.utimesSync(configFile, future, future);

			expect(isCacheBusted(cacheFile, [configFile])).toBe(true);
		});
	});

	it("returns false when the cache is newer than every bust file", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const cacheFile = path.join(directory, ".eslintcache");
			const configFile = path.join(directory, "eslint.config.ts");
			fs.writeFileSync(configFile, "export default []");
			const past = Date.now() / 1000 - 60;
			fs.utimesSync(configFile, past, past);
			fs.writeFileSync(cacheFile, "{}");

			expect(isCacheBusted(cacheFile, [configFile])).toBe(false);
		});
	});

	it("returns false when the cache file is missing", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(isCacheBusted(path.join(directory, "missing"), [])).toBe(false);
		});
	});

	it("clears every managed cache file", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			for (const name of ALL_CACHE_FILES) {
				fs.writeFileSync(path.join(directory, name), "{}");
			}

			clearAllCaches(directory);

			for (const name of ALL_CACHE_FILES) {
				expect(fs.existsSync(path.join(directory, name))).toBe(false);
			}
		});
	});

	it("clears keyed cache variants, not just the base names", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const variants = ALL_CACHE_FILES.flatMap((name) => [
				cacheFileFor(name, "aaaa1111"),
				cacheFileFor(name, "bbbb2222"),
			]);
			for (const name of variants) {
				fs.writeFileSync(path.join(directory, name), "{}");
			}

			clearAllCaches(directory);

			for (const name of variants) {
				expect(fs.existsSync(path.join(directory, name))).toBe(false);
			}
		});
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
			expect.hasAssertions();

			withTemporaryDirectory((directory) => {
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
		});

		it("deletes nothing when there is no bust file", () => {
			expect.hasAssertions();

			withTemporaryDirectory((directory) => {
				const cacheFile = path.join(directory, cacheFileFor(CACHE_FILE_FAST, "aaaa1111"));
				fs.writeFileSync(cacheFile, "{}");

				expect(sweepStaleCaches(directory, undefined)).toStrictEqual([]);
				expect(fs.existsSync(cacheFile)).toBe(true);
			});
		});
	});

	describe("resolveCacheKey", () => {
		it("separates the agent, editor, CI and default variants", () => {
			expect.hasAssertions();

			const keys = [
				resolveCacheKey({}),
				resolveCacheKey({ CLAUDECODE: "1" }),
				resolveCacheKey({ VSCODE_PID: "1" }),
				resolveCacheKey({ CI: "true" }),
			];

			const unique = new Set(keys);

			expect(unique.size).toBe(keys.length);
		});

		it("pins a git-hook run to the same variant as a plain run", () => {
			expect.hasAssertions();

			// `isInAgentSession` and `isInEditorEnvironment` both return false
			// under GIT_HOOK, so a hook run shares the no-agent cache rather than
			// opening a third one.
			expect(resolveCacheKey({ CLAUDECODE: "1", GIT_HOOK: "1" })).toBe(resolveCacheKey({}));
		});

		it("honours the ISENTINEL_LINT_CACHE_KEY escape hatch", () => {
			expect.hasAssertions();

			expect(resolveCacheKey({ ISENTINEL_LINT_CACHE_KEY: "strict" })).not.toBe(
				resolveCacheKey({}),
			);
			expect(resolveCacheKey({ ISENTINEL_LINT_CACHE_KEY: "strict" })).toBe(
				resolveCacheKey({ ISENTINEL_LINT_CACHE_KEY: "strict" }),
			);
		});
	});

	it("counts all files when the cache is missing", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const fileA = path.join(directory, "a.ts");
			const fileB = path.join(directory, "b.ts");
			fs.writeFileSync(fileA, "const a = 1;");
			fs.writeFileSync(fileB, "const b = 2;");

			expect(
				listDirtyFiles(path.join(directory, "missing"), [fileA, fileB], false),
			).toHaveLength(2);
		});
	});

	it("counts only changed and uncached files", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const cacheFile = path.join(directory, ".eslintcache");
			const fileA = path.join(directory, "a.ts");
			const fileB = path.join(directory, "b.ts");
			fs.writeFileSync(fileA, "const a = 1;");
			fs.writeFileSync(fileB, "const b = 2;");

			const cache = fileEntryCache.createFromFile(cacheFile, false) as unknown as {
				getFileDescriptor: (file: string) => unknown;
				reconcile: () => void;
			};
			cache.getFileDescriptor(fileA);
			cache.reconcile();

			// fileA is cached and unchanged; fileB was never seen.
			expect(listDirtyFiles(cacheFile, [fileA, fileB], false)).toHaveLength(1);

			fs.writeFileSync(fileA, "const a = 42;");
			const future = Date.now() / 1000 + 60;
			fs.utimesSync(fileA, future, future);

			expect(listDirtyFiles(cacheFile, [fileA, fileB], false)).toHaveLength(2);
		});
	});
});

describe("collectLintableFiles", () => {
	it("collects the TS/JS family plus JSONC, YAML, TOML, Markdown and Lua", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
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

			const files = withoutGitEnvironment(() => collectLintableFiles(directory, ["."]));
			const collected = files.map((file) => path.basename(file));

			expect(collected.toSorted()).toStrictEqual(lintable.toSorted());
		});
	});
});

describe("splitArgs", () => {
	it("splits on whitespace and respects quotes", () => {
		expect.hasAssertions();

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
		expect.hasAssertions();

		const command = composeOxlintCommand(options({ agents: true, fix: true }), {
			oxlintTypeAware: true,
			paths: ["src"],
		});

		expect(command.args).toStrictEqual(["--format", "agent", "--type-aware", "--fix", "src"]);
		expect(command.env).toStrictEqual({});
	});

	it("omits --type-aware from oxlint when disabled", () => {
		expect.hasAssertions();

		const command = composeOxlintCommand(options(), { oxlintTypeAware: false, paths: ["."] });

		expect(command.args).not.toContain("--type-aware");
	});

	it("composes the ESLint command with cache location and concurrency", () => {
		expect.hasAssertions();

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
		expect.hasAssertions();

		const command = composeEslintCommand(options(), baseContext({ ci: true, concurrency: 2 }));
		const strategyIndex = command.args.indexOf("--cache-strategy");

		expect(strategyIndex).toBeGreaterThan(-1);
		expect(command.args[strategyIndex + 1]).toBe("content");
	});

	it("drops cache flags when caching is disabled", () => {
		expect.hasAssertions();

		const command = composeEslintCommand(options({ cache: false }), baseContext({ ci: true }));

		expect(command.args).not.toContain("--cache");
		expect(command.args).not.toContain("--cache-strategy");
	});

	it("points ESLint at the agents formatter", () => {
		expect.hasAssertions();

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
		expect.hasAssertions();

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
		expect.hasAssertions();

		const command = composeOxlintCommand(options(), { oxlintTypeAware: true, paths: ["."] });

		expect(formatCommandLine(command)).toBe("oxlint --type-aware .");
	});
});

describe("buildShellCommand", () => {
	it("quotes tokens with spaces per platform", () => {
		expect.hasAssertions();

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
		expect.hasAssertions();

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
		expect.hasAssertions();

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
	return withoutGitEnvironment(() => {
		const { commands } = composeCommands(parseArguments(argv), {
			cwd: directory,
			dryRun: true,
			environment,
		});
		return commands.map((command) => formatCommandLine(command));
	});
}

describe("composeCommands --print", () => {
	it("composes the default concurrent two-pass mode plus oxlint", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines([], directory)).toStrictEqual([
				"oxlint --type-aware .",
				`ESLINT_TYPE_AWARE=off eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_FAST)} ` +
					"--no-warn-ignored --concurrency off .",
				`ESLINT_TYPE_AWARE=only eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_TYPE_AWARE)} ` +
					"--no-warn-ignored --concurrency off .",
			]);
		});
	});

	it("composes only the fast pass for --type-aware=off", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines(["--type-aware=off"], directory)).toStrictEqual([
				"oxlint .",
				`ESLINT_TYPE_AWARE=off eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_FAST)} ` +
					"--no-warn-ignored --concurrency off .",
			]);
		});
	});

	it("composes only the typed pass for --type-aware=only", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines(["--type-aware=only"], directory)).toStrictEqual([
				"oxlint --type-aware .",
				`ESLINT_TYPE_AWARE=only eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_TYPE_AWARE)} ` +
					"--no-warn-ignored --concurrency off .",
			]);
		});
	});

	it("composes the full config for the --type-aware=full escape hatch", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines(["--type-aware=full"], directory)).toStrictEqual([
				"oxlint --type-aware .",
				`eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_DEFAULT)} --no-warn-ignored --concurrency off .`,
			]);
		});
	});

	it("composes a single full pass with the content cache strategy in CI", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines([], directory, { CI: "true" })).toStrictEqual([
				"oxlint --type-aware .",
				`eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_DEFAULT, { CI: "true" })} --no-warn-ignored --concurrency off --cache-strategy content .`,
			]);
		});
	});

	it("composes the sequential full-config fix pass", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines(["--fix"], directory)).toStrictEqual([
				"oxlint --type-aware --fix .",
				`eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_DEFAULT)} --no-warn-ignored --concurrency off --fix .`,
			]);
		});
	});
});

describe("plan", () => {
	it("returns the default fast + typed passes as data", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const runPlan = withoutGitEnvironment(() => {
				return plan(parseArguments([]), directory, {}, false);
			});

			expect(runPlan.oxlint).toBe(true);
			expect(runPlan.oxlintTypeAware).toBe(true);
			expect(runPlan.passes.map((pass) => pass.descriptor.label)).toStrictEqual([
				"fast",
				"typed",
			]);
			// A read-only plan never auto-skips the typed pass.
			expect(runPlan.passes.every((pass) => pass.shouldRun)).toBe(true);
		});
	});

	it("plans no ESLint passes for an oxlint-only run", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const runPlan = withoutGitEnvironment(() => {
				return plan(parseArguments(["--oxlint"]), directory, {}, false);
			});

			expect(runPlan.oxlint).toBe(true);
			expect(runPlan.passes).toStrictEqual([]);
		});
	});

	it("collapses to a single pass for the explicit modes", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const fast = withoutGitEnvironment(() => {
				return plan(parseArguments(["--type-aware=off"]), directory, {}, false);
			});
			const full = withoutGitEnvironment(() => {
				return plan(parseArguments([]), directory, { CI: "true" }, false);
			});

			expect(fast.passes.map((pass) => pass.descriptor.label)).toStrictEqual(["fast"]);
			expect(full.passes.map((pass) => pass.descriptor.label)).toStrictEqual(["eslint"]);
		});
	});
});

describe("fast pass sizing", () => {
	it("sizes the fast pass from FAST_FILES_PER_WORKER and the typed pass from 350", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			for (const name of ["a.ts", "b.ts", "c.ts"]) {
				fs.writeFileSync(path.join(directory, name), "export const x = 1;\n");
			}

			const { commands } = withoutGitEnvironment(() => {
				return composeCommands(parseArguments([]), {
					cwd: directory,
					dryRun: true,
					environment: { FAST_FILES_PER_WORKER: "1", LINT_MAX_WORKERS: "8" },
				});
			});

			// Three dirty files: FAST_FILES_PER_WORKER=1 => 3 fast workers; the
			// typed pass keeps the 350-file default => a single worker (off).
			expect(concurrencyArgument(commands, "fast")).toBe("3");
			expect(concurrencyArgument(commands, "typed")).toBe("off");
		});
	});
});

describe("resolveFastFilesPerWorker", () => {
	it("defaults to 800 and honours FAST_FILES_PER_WORKER", () => {
		expect.hasAssertions();

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

	it("stores the hash without busting on the first run", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			writePackageJson(directory, { exports: "./index.js" });
			seedCaches(directory);

			const outcome = applyPackageJsonBust(directory, key);

			expect(outcome).toStrictEqual({ busted: false, firstRun: true });
			expect(everyCacheExists(directory)).toBe(true);
		});
	});

	it("deletes the type-aware caches but keeps the fast cache when exports change", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			writePackageJson(directory, { exports: "./index.js" });
			applyPackageJsonBust(directory, key);
			seedCaches(directory);

			writePackageJson(directory, { exports: "./other.js" });
			const outcome = applyPackageJsonBust(directory, key);

			expect(outcome).toStrictEqual({ busted: true, firstRun: false });
			expect(
				fs.existsSync(path.join(directory, cacheFileFor(CACHE_FILE_TYPE_AWARE, key))),
			).toBe(false);
			expect(fs.existsSync(path.join(directory, cacheFileFor(CACHE_FILE_DEFAULT, key)))).toBe(
				false,
			);
			expect(fs.existsSync(path.join(directory, cacheFileFor(CACHE_FILE_FAST, key)))).toBe(
				true,
			);
		});
	});

	it("does not bust when only unrelated fields change", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			writePackageJson(directory, { exports: "./index.js", scripts: { build: "tsc" } });
			applyPackageJsonBust(directory, key);
			seedCaches(directory);

			writePackageJson(directory, {
				exports: "./index.js",
				scripts: { build: "tsc --noEmit" },
				version: "9.9.9",
			});
			const outcome = applyPackageJsonBust(directory, key);

			expect(outcome).toStrictEqual({ busted: false, firstRun: false });
			expect(everyCacheExists(directory)).toBe(true);
		});
	});

	it("lets each variant observe the same bump independently", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const agentKey = resolveCacheKey({ CLAUDECODE: "1" });
			writePackageJson(directory, { exports: "./index.js" });
			applyPackageJsonBust(directory, key);
			applyPackageJsonBust(directory, agentKey);

			seedCaches(directory);
			for (const name of ALL_CACHE_FILES) {
				fs.writeFileSync(path.join(directory, cacheFileFor(name, agentKey)), "{}");
			}

			writePackageJson(directory, { exports: "./other.js" });

			// The no-agent run busts only its own caches, and crucially does not
			// consume the bump on the agent variant's behalf: a shared state file
			// would make the second call a no-op and leave the agent's type-aware
			// caches permanently stale.
			expect(applyPackageJsonBust(directory, key)).toStrictEqual({
				busted: true,
				firstRun: false,
			});
			expect(
				fs.existsSync(path.join(directory, cacheFileFor(CACHE_FILE_TYPE_AWARE, agentKey))),
			).toBe(true);

			expect(applyPackageJsonBust(directory, agentKey)).toStrictEqual({
				busted: true,
				firstRun: false,
			});
			expect(
				fs.existsSync(path.join(directory, cacheFileFor(CACHE_FILE_TYPE_AWARE, agentKey))),
			).toBe(false);
		});
	});

	it("stores each variant's hash under its own state file", () => {
		expect.hasAssertions();

		expect(packageHashStatePath("/project", "aaaa1111")).not.toBe(
			packageHashStatePath("/project", "bbbb2222"),
		);
	});

	it("hashes resolution fields independent of key order", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
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
	});

	it("folds a workspace-root dependency bump into the sub-package hash", () => {
		expect.hasAssertions();

		const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-ph-"));
		try {
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
		} finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});
});

describe("runConcurrent", () => {
	it("runs every child to completion and aggregates a non-zero exit", async () => {
		expect.hasAssertions();

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-run-"));
		try {
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

			const code = await runConcurrent(
				[
					{ args: [], bin: "oxlint", env: {}, label: "oxc" },
					{ args: [], bin: "eslint", env: {}, label: "eslint" },
				],
				directory,
			);

			expect(code).toBe(1);
			expect(fs.existsSync(eslintMarker)).toBe(true);
			expect(fs.existsSync(oxcMarker)).toBe(true);
		} finally {
			fs.rmSync(directory, { force: true, recursive: true });
		}
	}, 15_000);
});

function repoFiles(overrides: Partial<RepoFiles> = {}): RepoFiles {
	return { bustFiles: [], lintable: [], targetsOutsideCwd: false, typeAware: [], ...overrides };
}

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
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			writeHybridStatus(directory, true);

			expect(fs.existsSync(hybridStatusPath(directory))).toBe(false);

			fs.mkdirSync(path.join(directory, "node_modules"));
			writeHybridStatus(directory, true);

			expect(readHybridStatus(directory)).toStrictEqual({ oxlint: true });
		});
	});

	it("refreshes the mtime on identical content and rewrites on change", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
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
	});

	it("swallows write failures", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			fs.mkdirSync(path.join(directory, "node_modules"));
			// `.cache` as a file makes creating the isentinel-lint subdir throw.
			fs.writeFileSync(path.join(directory, "node_modules", ".cache"), "");

			expect(() => {
				writeHybridStatus(directory, true);
			}).not.toThrow();
			expect(readHybridStatus(directory)).toBeUndefined();
		});
	});

	it("returns undefined for malformed status content", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const statusPath = hybridStatusPath(directory);
			fs.mkdirSync(path.dirname(statusPath), { recursive: true });
			fs.writeFileSync(statusPath, "not json");

			expect(readHybridStatus(directory)).toBeUndefined();
		});
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
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			fs.mkdirSync(path.join(directory, "node_modules"));
			const config = freshConfig(directory);
			writeHybridStatus(directory, false);

			let probeCalls = 0;
			function probe(): HybridStatus {
				probeCalls += 1;
				return { oxlint: false };
			}

			const decision = resolveOxlintRun(
				{
					cwd: directory,
					files: repoFiles({ bustFiles: [config] }),
					mutate: true,
					runEslint: true,
					runOxlint: true,
				},
				probe,
			);

			expect(decision).toStrictEqual({ reason: NON_HYBRID_WARNING, run: false });
			expect(probeCalls).toBe(0);
		});
	});

	it("runs both engines when a fresh status is hybrid, without probing", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			fs.mkdirSync(path.join(directory, "node_modules"));
			const config = freshConfig(directory);
			writeHybridStatus(directory, true);

			let probeCalls = 0;
			function probe(): HybridStatus {
				probeCalls += 1;
				return { oxlint: false };
			}

			const decision = resolveOxlintRun(
				{
					cwd: directory,
					files: repoFiles({ bustFiles: [config] }),
					mutate: true,
					runEslint: true,
					runOxlint: true,
				},
				probe,
			);

			expect(decision).toStrictEqual({ reason: undefined, run: true });
			expect(probeCalls).toBe(0);
		});
	});

	it("probes when the status is stale and persists the probe result", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
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
				{
					cwd: directory,
					files: repoFiles({
						bustFiles: [config],
						typeAware: [path.join(directory, "a.ts")],
					}),
					mutate: true,
					runEslint: true,
					runOxlint: true,
				},
				probe,
			);

			expect(probeCalls).toBe(1);
			expect(decision).toStrictEqual({ reason: NON_HYBRID_WARNING, run: false });
			expect(readHybridStatus(directory)).toStrictEqual({ oxlint: false });
		});
	});

	it("fails open when the probe cannot determine the status", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			fs.mkdirSync(path.join(directory, "node_modules"));

			const decision = resolveOxlintRun(
				{
					cwd: directory,
					files: repoFiles({ typeAware: [path.join(directory, "a.ts")] }),
					mutate: true,
					runEslint: true,
					runOxlint: true,
				},
				() => {},
			);

			expect(decision).toStrictEqual({ reason: HYBRID_UNKNOWN_WARNING, run: true });
		});
	});

	it("skips the check for explicit single-tool runs", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			let probeCalls = 0;
			function probe(): HybridStatus {
				probeCalls += 1;
				return { oxlint: false };
			}

			// --oxlint leaves runEslint false; --eslint leaves runOxlint false.
			const oxlintOnly = resolveOxlintRun(
				{
					cwd: directory,
					files: repoFiles(),
					mutate: true,
					runEslint: false,
					runOxlint: true,
				},
				probe,
			);
			const eslintOnly = resolveOxlintRun(
				{
					cwd: directory,
					files: repoFiles(),
					mutate: true,
					runEslint: true,
					runOxlint: false,
				},
				probe,
			);

			expect(oxlintOnly).toStrictEqual({ reason: undefined, run: true });
			expect(eslintOnly).toStrictEqual({ reason: undefined, run: false });
			expect(probeCalls).toBe(0);
		});
	});

	it("never probes or writes for a read-only (--print) plan", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
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
				{
					cwd: directory,
					files: repoFiles({
						bustFiles: [config],
						typeAware: [path.join(directory, "a.ts")],
					}),
					mutate: false,
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
});

describe("plan hybrid integration", () => {
	it("drops the oxlint child for a fresh non-hybrid status", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			fs.mkdirSync(path.join(directory, "node_modules"));
			const config = path.join(directory, "eslint.config.ts");
			fs.writeFileSync(config, "export default []");
			fs.writeFileSync(path.join(directory, "a.ts"), "export const x = 1;\n");
			setMtimeInPast(config);
			writeHybridStatus(directory, false);

			const { commands, notice } = withoutGitEnvironment(() => {
				return composeCommands(parseArguments([]), {
					cwd: directory,
					dryRun: false,
					environment: {},
				});
			});

			expect(commands.some((command) => command.label === "oxc")).toBe(false);
			expect(notice).toContain(NON_HYBRID_WARNING);
		});
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
		expect.hasAssertions();

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-pre-"));
		try {
			fs.mkdirSync(path.join(directory, "node_modules"), { recursive: true });
			writeFakeToolBin(directory, "eslint", NOOP_ESLINT_BIN);
			// A fresh non-hybrid status drops oxlint, so no oxlint child carries
			// --type-aware and the check must not fire.
			writeHybridStatus(directory, false);

			const code = await withoutGitEnvironment(async () => runLint([], directory, {}));

			expect(code).toBe(0);
		} finally {
			fs.rmSync(directory, { force: true, recursive: true });
		}
	});

	it("still errors for an explicit --oxlint run without oxlint-tsgolint", async () => {
		expect.hasAssertions();

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-pre-"));
		try {
			await expect(
				withoutGitEnvironment(async () => runLint(["--oxlint"], directory, {})),
			).rejects.toThrow(/oxlint-tsgolint is not installed/);
		} finally {
			fs.rmSync(directory, { force: true, recursive: true });
		}
	});

	it("prints without erroring when oxlint-tsgolint is absent", async () => {
		expect.hasAssertions();

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-pre-"));
		const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
		try {
			const code = await withoutGitEnvironment(async () => {
				return runLint(["--print"], directory, {});
			});

			expect(code).toBe(0);

			// --print returns before the check, so it never throws even though
			// the composed oxlint child carries --type-aware.
			const printed = spy.mock.calls.map((call) => String(call[0])).join("");

			expect(printed).toContain("oxlint --type-aware");
		} finally {
			spy.mockRestore();
			fs.rmSync(directory, { force: true, recursive: true });
		}
	});
});

describe("target normalization", () => {
	it("relativizes an absolute target under cwd and matches its files", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			fs.mkdirSync(path.join(directory, "src"));
			fs.writeFileSync(path.join(directory, "src", "a.ts"), "export const a = 1;\n");
			fs.writeFileSync(path.join(directory, "b.ts"), "export const b = 2;\n");

			const files = withoutGitEnvironment(() => {
				return collectRepoFiles(directory, [path.join(directory, "src")]);
			});

			expect(files.lintable.map((file) => path.basename(file))).toStrictEqual(["a.ts"]);
			expect(files.targetsOutsideCwd).toBe(false);
		});
	});

	it("flags a relative target that escapes cwd", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			fs.writeFileSync(path.join(directory, "a.ts"), "export const a = 1;\n");

			const files = withoutGitEnvironment(() => collectRepoFiles(directory, ["../sibling"]));

			expect(files.targetsOutsideCwd).toBe(true);
		});
	});

	it("flags an absolute target outside cwd", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const outside = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-outside-"));
			try {
				const files = withoutGitEnvironment(() => collectRepoFiles(directory, [outside]));

				expect(files.targetsOutsideCwd).toBe(true);
			} finally {
				fs.rmSync(outside, { force: true, recursive: true });
			}
		});
	});

	it("still treats './' and trailing slashes as match-all in-cwd targets", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			fs.mkdirSync(path.join(directory, "src"));
			fs.writeFileSync(path.join(directory, "src", "a.ts"), "export const a = 1;\n");

			const dot = withoutGitEnvironment(() => collectRepoFiles(directory, ["./"]));
			const trailing = withoutGitEnvironment(() => collectRepoFiles(directory, ["src/"]));

			expect(dot.lintable).toHaveLength(1);
			expect(dot.targetsOutsideCwd).toBe(false);
			expect(trailing.lintable).toHaveLength(1);
			expect(trailing.targetsOutsideCwd).toBe(false);
		});
	});
});

describe("workspace root", () => {
	it("returns the nearest ancestor bearing a marker", () => {
		expect.hasAssertions();

		const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-ws-"));
		try {
			fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
			const app = path.join(root, "packages", "app");
			fs.mkdirSync(app, { recursive: true });

			expect(findWorkspaceRoot(app)).toBe(root);
		} finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});
});

describe("ancestor cache-bust collection", () => {
	it("folds workspace-root bust files into a sub-package run", () => {
		expect.hasAssertions();

		const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-anc-"));
		try {
			fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
			fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
			fs.writeFileSync(path.join(root, "tsconfig.json"), "{}");
			const app = path.join(root, "packages", "app");
			fs.mkdirSync(app, { recursive: true });
			fs.writeFileSync(path.join(app, "a.ts"), "export const a = 1;\n");

			const files = withoutGitEnvironment(() => collectRepoFiles(app, ["."]));

			expect(files.bustFiles).toContain(path.join(root, "pnpm-lock.yaml"));
			expect(files.bustFiles).toContain(path.join(root, "tsconfig.json"));
		} finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});

	it("collects nothing extra when cwd is itself the workspace root", () => {
		expect.hasAssertions();

		const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-anc-"));
		try {
			fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
			fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

			const files = withoutGitEnvironment(() => collectRepoFiles(root, ["."]));

			// The root lockfile comes from the in-cwd scan, not doubled by the
			// ancestor walk.
			const lockfiles = files.bustFiles.filter(
				(file) => path.basename(file) === "pnpm-lock.yaml",
			);

			expect(lockfiles).toHaveLength(1);
		} finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});
});

describe("full-pass env hygiene", () => {
	it("explicitly clears ESLINT_TYPE_AWARE for the full pass so an inherited value cannot leak", () => {
		expect.hasAssertions();

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
		expect.hasAssertions();

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
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines(["--type-aware=only"], directory, { CI: "true" })).toStrictEqual([
				"oxlint --type-aware .",
				`ESLINT_TYPE_AWARE=only eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_TYPE_AWARE, { CI: "true" })} ` +
					"--no-warn-ignored --concurrency off --cache-strategy content .",
			]);
		});
	});

	it("keeps an explicit --type-aware=off pass in CI", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines(["--type-aware=off"], directory, { CI: "true" })).toStrictEqual([
				"oxlint .",
				`ESLINT_TYPE_AWARE=off eslint --cache --cache-location ${keyedCacheFile(CACHE_FILE_FAST, { CI: "true" })} ` +
					"--no-warn-ignored --concurrency off --cache-strategy content .",
			]);
		});
	});
});

describe("bust-before-size ordering", () => {
	it("clears every cache up front so an earlier pass is not under-provisioned", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
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

			const { commands } = withoutGitEnvironment(() => {
				return composeCommands(parseArguments([]), {
					cwd: directory,
					dryRun: false,
					environment: { FAST_FILES_PER_WORKER: "1", LINT_MAX_WORKERS: "8" },
				});
			});

			// Every lintable file (three sources plus eslint.config.ts) is dirty
			// after the up-front clear => four fast workers at one file per
			// worker. Without the fix the fast pass reads its fresh cache, sees
			// only the uncached config file (one dirty) and sizes to "off".
			expect(concurrencyArgument(commands, "fast")).toBe("4");
		});
	});
});

describe("parseHybridPrintConfig", () => {
	it("reads the marker through leading log noise", () => {
		expect.hasAssertions();

		expect(
			parseHybridPrintConfig('startup log\n{"settings":{"isentinel/oxlint":true}}'),
		).toStrictEqual({ oxlint: true });
		expect(parseHybridPrintConfig('noise {"settings":{}} trailing')).toStrictEqual({
			oxlint: false,
		});
	});

	it("returns undefined when there is no JSON object", () => {
		expect.hasAssertions();

		expect(parseHybridPrintConfig("not json at all")).toBeUndefined();
		expect(parseHybridPrintConfig("")).toBeUndefined();
	});
});

describe("buildShellCommand percent guard", () => {
	it("refuses a % token on the Windows shell path but quotes it on POSIX", () => {
		expect.hasAssertions();

		expect(() => buildShellCommand("node", "/path/eslint.js", ["%PATH%"], "win32")).toThrow(
			CliError,
		);
		expect(buildShellCommand("node", "/path/eslint.js", ["50%"], "linux")).toBe(
			"node /path/eslint.js '50%'",
		);
	});
});
