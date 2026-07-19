// cspell:words typeaware
import fileEntryCache from "file-entry-cache";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { clearAllCaches, countDirtyFiles, isCacheBusted } from "../src/lint-cli/cache.ts";
import {
	buildShellCommand,
	composeEslintCommand,
	composeOxlintCommand,
	formatCommandLine,
	splitArgs,
} from "../src/lint-cli/command.ts";
import { computeWorkerCount, resolveWorkerLimits } from "../src/lint-cli/concurrency.ts";
import { ALL_CACHE_FILES, cacheFileForMode } from "../src/lint-cli/constants.ts";
import { parseArguments } from "../src/lint-cli/options.ts";
import type { ComposeContext, LintCliOptions } from "../src/lint-cli/types.ts";
import { CliError } from "../src/lint-cli/types.ts";

function baseContext(overrides: Partial<ComposeContext> = {}): ComposeContext {
	return {
		agentsFormatterPath: "/dist/formatter-agents.mjs",
		cacheLocation: ".eslintcache",
		ci: false,
		concurrency: "off",
		oxlintTypeAware: false,
		paths: ["."],
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

describe("cacheFileForMode", () => {
	it("maps type-aware modes to cache files", () => {
		expect.hasAssertions();

		expect(cacheFileForMode(undefined)).toBe(".eslintcache");
		expect(cacheFileForMode("off")).toBe(".eslintcache-fast");
		expect(cacheFileForMode("only")).toBe(".eslintcache-typeaware");
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

	it("counts all files when the cache is missing", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			const fileA = path.join(directory, "a.ts");
			const fileB = path.join(directory, "b.ts");
			fs.writeFileSync(fileA, "const a = 1;");
			fs.writeFileSync(fileB, "const b = 2;");

			expect(countDirtyFiles(path.join(directory, "missing"), [fileA, fileB], false)).toBe(2);
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
			expect(countDirtyFiles(cacheFile, [fileA, fileB], false)).toBe(1);

			fs.writeFileSync(fileA, "const a = 42;");
			const future = Date.now() / 1000 + 60;
			fs.utimesSync(fileA, future, future);

			expect(countDirtyFiles(cacheFile, [fileA, fileB], false)).toBe(2);
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

		const command = composeOxlintCommand(
			options({ agents: true, fix: true }),
			baseContext({ oxlintTypeAware: true, paths: ["src"] }),
		);

		expect(command.args).toStrictEqual(["--format", "agent", "--type-aware", "--fix", "src"]);
		expect(command.env).toStrictEqual({});
	});

	it("omits --type-aware from oxlint when disabled", () => {
		expect.hasAssertions();

		const command = composeOxlintCommand(options(), baseContext({ oxlintTypeAware: false }));

		expect(command.args).not.toContain("--type-aware");
	});

	it("composes the ESLint command with cache location and concurrency", () => {
		expect.hasAssertions();

		const command = composeEslintCommand(
			options({ typeAware: "off" }),
			baseContext({ cacheLocation: ".eslintcache-fast", concurrency: 4, paths: ["src"] }),
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
			options({ typeAware: "off" }),
			baseContext({ cacheLocation: ".eslintcache-fast", ci: true, concurrency: 4 }),
		);

		expect(formatCommandLine(command)).toBe(
			"ESLINT_TYPE_AWARE=off eslint --cache --cache-location .eslintcache-fast " +
				"--no-warn-ignored --concurrency 4 --cache-strategy content .",
		);
	});

	it("renders oxlint without an env prefix", () => {
		expect.hasAssertions();

		const command = composeOxlintCommand(options(), baseContext({ oxlintTypeAware: true }));

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
});
