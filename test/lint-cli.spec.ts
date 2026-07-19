// cspell:words typeaware lintable
import fileEntryCache from "file-entry-cache";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

import { clearAllCaches, countDirtyFiles, isCacheBusted } from "../src/lint-cli/cache.ts";
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
	CACHE_FILE_FAST,
	CACHE_FILE_TYPE_AWARE,
	cacheFileForMode,
} from "../src/lint-cli/constants.ts";
import { collectLintableFiles } from "../src/lint-cli/files.ts";
import { parseArguments } from "../src/lint-cli/options.ts";
import { applyPackageJsonBust, computePackageJsonHash } from "../src/lint-cli/package-hash.ts";
import { composeCommands, runConcurrent } from "../src/lint-cli/run.ts";
import type { ChildCommand, ComposeContext, LintCliOptions } from "../src/lint-cli/types.ts";
import { CliError } from "../src/lint-cli/types.ts";

function baseContext(overrides: Partial<ComposeContext> = {}): ComposeContext {
	return {
		agentsFormatterPath: "/dist/formatter-agents.mjs",
		cacheLocation: ".eslintcache",
		ci: false,
		concurrency: "off",
		eslintLabel: "eslint",
		oxlintTypeAware: false,
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

function withoutGitEnvironment<T>(run: () => T): T {
	const keys = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"];
	const saved = keys.map((key): [string, string | undefined] => [key, process.env[key]]);
	for (const key of keys) {
		delete process.env[key];
	}

	try {
		return run();
	} finally {
		for (const [key, value] of saved) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
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
				"ESLINT_TYPE_AWARE=off eslint --cache --cache-location .eslintcache-fast " +
					"--no-warn-ignored --concurrency off .",
				"ESLINT_TYPE_AWARE=only eslint --cache --cache-location .eslintcache-typeaware " +
					"--no-warn-ignored --concurrency off .",
			]);
		});
	});

	it("composes only the fast pass for --type-aware=off", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines(["--type-aware=off"], directory)).toStrictEqual([
				"oxlint .",
				"ESLINT_TYPE_AWARE=off eslint --cache --cache-location .eslintcache-fast " +
					"--no-warn-ignored --concurrency off .",
			]);
		});
	});

	it("composes only the typed pass for --type-aware=only", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines(["--type-aware=only"], directory)).toStrictEqual([
				"oxlint --type-aware .",
				"ESLINT_TYPE_AWARE=only eslint --cache --cache-location .eslintcache-typeaware " +
					"--no-warn-ignored --concurrency off .",
			]);
		});
	});

	it("composes the full config for the --type-aware=full escape hatch", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines(["--type-aware=full"], directory)).toStrictEqual([
				"oxlint --type-aware .",
				"eslint --cache --cache-location .eslintcache --no-warn-ignored --concurrency off .",
			]);
		});
	});

	it("composes a single full pass with the content cache strategy in CI", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines([], directory, { CI: "true" })).toStrictEqual([
				"oxlint --type-aware .",
				"eslint --cache --cache-location .eslintcache --no-warn-ignored --concurrency off " +
					"--cache-strategy content .",
			]);
		});
	});

	it("composes the sequential full-config fix pass", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			expect(printLines(["--fix"], directory)).toStrictEqual([
				"oxlint --type-aware --fix .",
				"eslint --cache --cache-location .eslintcache --no-warn-ignored --concurrency off " +
					"--fix .",
			]);
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

	function seedCaches(directory: string): void {
		for (const name of ALL_CACHE_FILES) {
			fs.writeFileSync(path.join(directory, name), "{}");
		}
	}

	it("stores the hash without busting on the first run", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			writePackageJson(directory, { exports: "./index.js" });
			seedCaches(directory);

			const outcome = applyPackageJsonBust(directory);

			expect(outcome).toStrictEqual({ busted: false, firstRun: true });

			for (const name of ALL_CACHE_FILES) {
				expect(fs.existsSync(path.join(directory, name))).toBe(true);
			}
		});
	});

	it("deletes the type-aware caches but keeps the fast cache when exports change", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			writePackageJson(directory, { exports: "./index.js" });
			applyPackageJsonBust(directory);
			seedCaches(directory);

			writePackageJson(directory, { exports: "./other.js" });
			const outcome = applyPackageJsonBust(directory);

			expect(outcome).toStrictEqual({ busted: true, firstRun: false });
			expect(fs.existsSync(path.join(directory, CACHE_FILE_TYPE_AWARE))).toBe(false);
			expect(fs.existsSync(path.join(directory, ".eslintcache"))).toBe(false);
			expect(fs.existsSync(path.join(directory, CACHE_FILE_FAST))).toBe(true);
		});
	});

	it("does not bust when only unrelated fields change", () => {
		expect.hasAssertions();

		withTemporaryDirectory((directory) => {
			writePackageJson(directory, { exports: "./index.js", scripts: { build: "tsc" } });
			applyPackageJsonBust(directory);
			seedCaches(directory);

			writePackageJson(directory, {
				exports: "./index.js",
				scripts: { build: "tsc --noEmit" },
				version: "9.9.9",
			});
			const outcome = applyPackageJsonBust(directory);

			expect(outcome).toStrictEqual({ busted: false, firstRun: false });

			for (const name of ALL_CACHE_FILES) {
				expect(fs.existsSync(path.join(directory, name))).toBe(true);
			}
		});
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
});

describe("runConcurrent", () => {
	function writeFakeBin(directory: string, name: string, body: string): void {
		const packageDirectory = path.join(directory, "node_modules", name);
		fs.mkdirSync(packageDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(packageDirectory, "package.json"),
			JSON.stringify({ name, bin: { [name]: "bin.js" }, version: "0.0.0" }),
		);
		fs.writeFileSync(path.join(packageDirectory, "bin.js"), body);
	}

	it("runs every child to completion and aggregates a non-zero exit", async () => {
		expect.hasAssertions();

		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cli-run-"));
		try {
			const oxcMarker = path.join(directory, "oxc-ran");
			const eslintMarker = path.join(directory, "eslint-ran");

			// oxlint succeeds but only after a delay; eslint fails immediately. A
			// kill-on-failure would kill oxlint before it writes its marker.
			writeFakeBin(
				directory,
				"oxlint",
				`const fs=require("node:fs");setTimeout(()=>{fs.writeFileSync(${JSON.stringify(
					oxcMarker,
				)},"ran");process.exit(0);},250);`,
			);
			writeFakeBin(
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
