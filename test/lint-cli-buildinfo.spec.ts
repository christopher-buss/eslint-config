// cspell:words tsbuildinfo tsgate typeaware buildinfo mojibake
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";

import { isRecord, isStringArray } from "../src/guards.ts";

/** The A/B child (see `test/buildinfo-child.ts`). */
const CHILD = fileURLToPath(new URL("./buildinfo-child.ts", import.meta.url));

/** Where every state file the runner writes lands inside a fixture. */
const STATE_DIRECTORY = "node_modules/.cache/isentinel-lint";

/** An mtime far enough in the past that no write could reproduce it. */
const ANCIENT_SECONDS = 1_000_000_000;

/** The answer the child reports for one builder pass. */
interface ChildResult {
	/** Project-relative posix paths the pass reported affected. */
	affected?: Array<string>;
	/** Whether the pass established initial state. */
	firstRun?: boolean;
	/** True when the builder path was skipped entirely. */
	skipped: boolean;
}

/** A fixture's file tree, keyed by project-relative path. */
type Tree = Record<string, string>;

const TSCONFIG = JSON.stringify({
	compilerOptions: { module: "commonjs", strict: true, target: "es2020" },
	include: ["src"],
});

/** The same config widened to a second root directory. */
const WIDE_TSCONFIG = JSON.stringify({
	compilerOptions: { module: "commonjs", strict: true, target: "es2020" },
	include: ["src", "extra"],
});

/** `src/a.ts` as the chain fixture ships it. */
const ORIGINAL_A = "export function a() { return 1; }\n";

/** An edit to `src/a.ts` that changes its inferred return type. */
const RESHAPED_A = "export function a() { return 'text'; }\n";

/**
 * The chain fixture: `c` imports `b` imports `a`, with inferred return types.
 */
const CHAIN: Tree = {
	"package.json": JSON.stringify({ name: "fixture", version: "0.0.0" }),
	"src/a.ts": ORIGINAL_A,
	"src/b.ts": "import { a } from './a';\nexport function b() { return a(); }\n",
	"src/c.ts": "import { b } from './b';\nexport function c() { return b(); }\n",
	"tsconfig.json": TSCONFIG,
};

/** A workspace whose sibling package is linked from the root. */
const WORKSPACE: Tree = {
	"package.json": JSON.stringify({
		name: "fixture",
		dependencies: { sibling: "workspace:*" },
		version: "0.0.0",
	}),
	"packages/sibling/index.d.ts": "export declare function sibling(): number;\n",
	"packages/sibling/package.json": JSON.stringify({
		name: "sibling",
		types: "index.d.ts",
		version: "1.0.0",
	}),
	"pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
	"pnpm-workspace.yaml": "packages:\n  - packages/*\n",
	"src/a.ts": ORIGINAL_A,
	"tsconfig.json": TSCONFIG,
};

/** A byte-order mark, which `ts.sys.readFile` strips and `fs` does not. */
const BOM = "﻿";

/** A fixture whose sources are stored in encodings `fs` would mangle. */
const ENCODED: Tree = {
	"package.json": JSON.stringify({ name: "fixture", version: "0.0.0" }),
	"src/bom.ts": `${BOM}export function bom() { return 1; }\n`,
	"tsconfig.json": TSCONFIG,
};

/** A solution-style entry config whose files all live behind references. */
const SOLUTION: Tree = {
	"app/b.ts": "import { a } from '../src/a';\nexport function b() { return a(); }\n",
	"app/tsconfig.json": JSON.stringify({
		compilerOptions: { composite: true, module: "commonjs", strict: true, target: "es2020" },
		include: ["."],
	}),
	"package.json": JSON.stringify({ name: "fixture", version: "0.0.0" }),
	"src/a.ts": ORIGINAL_A,
	"tsconfig.json": JSON.stringify({
		files: [],
		include: [],
		references: [{ path: "./tsconfig.lib.json" }, { path: "./app" }],
	}),
	"tsconfig.lib.json": JSON.stringify({
		compilerOptions: { composite: true, module: "commonjs", strict: true, target: "es2020" },
		include: ["src"],
	}),
};

/** One A/B scenario: what the tree starts as, and what happens to it. */
interface Scenario {
	/** The scenario's mutation, applied after both sides are warm. */
	mutate: (directory: string) => void;
	/** Extra setup applied before warming, for content a `Tree` cannot hold. */
	prepare?: (directory: string) => void;
	/** The fixture's files. */
	tree: Tree;
	/** Whether to establish builder state first. Defaults to true. */
	warm?: boolean;
}

/** What one A/B comparison observed. */
interface Comparison {
	/** The answer from the run forced down the builder path. */
	builder: ChildResult;
	/** The answer from the run allowed to take the fast path. */
	fast: ChildResult;
	/** Whether the fast side actually short-circuited. */
	fastPath: boolean;
}

/**
 * Write a file, creating its directory.
 *
 * @param absolute - The absolute file path.
 * @param content - The content to write.
 */
function writeFile(absolute: string, content: string): void {
	fs.mkdirSync(path.dirname(absolute), { recursive: true });
	fs.writeFileSync(absolute, content);
}

/**
 * Write out a fixture project with its own resolvable `typescript`.
 *
 * @param tree - The files to write, keyed by project-relative path.
 * @returns The absolute project root.
 */
function createFixture(tree: Tree): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "buildinfo-fx-"));

	onTestFinished(() => {
		fs.rmSync(directory, { force: true, recursive: true });
	});

	const typescriptDirectory = path.dirname(
		createRequire(import.meta.url).resolve("typescript/package.json"),
	);
	fs.mkdirSync(path.join(directory, "node_modules"), { recursive: true });
	fs.symlinkSync(
		fs.realpathSync(typescriptDirectory),
		path.join(directory, "node_modules", "typescript"),
		"junction",
	);

	for (const [relative, content] of Object.entries(tree)) {
		writeFile(path.join(directory, relative), content);
	}

	return directory;
}

/**
 * Read a JSON file as a record, or an empty one when it holds anything else.
 *
 * @param file - The absolute file path.
 * @returns The parsed object.
 */
function readJson(file: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
	return isRecord(parsed) ? parsed : {};
}

/**
 * Run one builder pass against a fixture, in a process of its own.
 *
 * @param directory - The fixture project root.
 * @returns The pass's answer.
 */
function runPass(directory: string): ChildResult {
	const outFile = path.join(os.tmpdir(), `buildinfo-ab-${process.pid}-${Math.random()}.json`);
	try {
		execFileSync(process.execPath, [CHILD, directory, outFile], {
			cwd: directory,
			stdio: ["ignore", "ignore", "pipe"],
		});

		const { affected, firstRun, skipped } = readJson(outFile);
		return {
			affected: isStringArray(affected) ? affected : undefined,
			firstRun: typeof firstRun === "boolean" ? firstRun : undefined,
			skipped: skipped === true,
		};
	} finally {
		fs.rmSync(outFile, { force: true });
	}
}

/**
 * Every state file of one kind a fixture holds.
 *
 * @param directory - The fixture project root.
 * @param prefix - The state-file name prefix (`tsbuildinfo` or `tsgate`).
 * @returns Absolute paths, empty when the state directory is absent.
 */
function stateFiles(directory: string, prefix: string): Array<string> {
	const stateDirectory = path.join(directory, STATE_DIRECTORY);
	if (!fs.existsSync(stateDirectory)) {
		return [];
	}

	return fs
		.readdirSync(stateDirectory)
		.filter((name) => name.startsWith(`${prefix}-`))
		.map((name) => path.join(stateDirectory, name));
}

/**
 * Backdate every gate file so a later write is detectable by mtime alone. The
 * fast path never writes the gate and the builder path always does, which makes
 * this the one observable that says which path a run took.
 *
 * @param directory - The fixture project root.
 */
function backdateGates(directory: string): void {
	for (const file of stateFiles(directory, "tsgate")) {
		fs.utimesSync(file, ANCIENT_SECONDS, ANCIENT_SECONDS);
	}
}

/**
 * Whether every gate file still carries its backdated mtime — that is, whether
 * the run took the fast path for every project.
 *
 * @param directory - The fixture project root.
 * @returns True when no gate was rewritten.
 */
function tookFastPath(directory: string): boolean {
	const gates = stateFiles(directory, "tsgate");
	return (
		gates.length > 0 &&
		gates.every((file) => Math.round(fs.statSync(file).mtimeMs / 1000) === ANCIENT_SECONDS)
	);
}

/**
 * Compare the fast path against the real builder on the same scenario.
 *
 * Both sides get their own fixture, warmed identically, and the same mutation.
 * The builder side then loses its gate files, which is the one thing that
 * forces `isBuildInfoUnchanged` to decline without perturbing the buildinfo
 * the two sides are being compared over.
 *
 * @param scenario - The tree, its setup and its mutation.
 * @returns The two answers plus whether the fast side short-circuited.
 */
function compare({ mutate, prepare, tree, warm = true }: Scenario): Comparison {
	const builderDirectory = createFixture(tree);
	const fastDirectory = createFixture(tree);

	for (const directory of [builderDirectory, fastDirectory]) {
		prepare?.(directory);
		if (warm) {
			runPass(directory);
		}

		mutate(directory);
	}

	for (const file of stateFiles(builderDirectory, "tsgate")) {
		fs.rmSync(file, { force: true });
	}

	backdateGates(fastDirectory);
	const builder = runPass(builderDirectory);
	const fast = runPass(fastDirectory);

	return { builder, fast, fastPath: tookFastPath(fastDirectory) };
}

/** A mutation that changes nothing. */
function unchanged(): void {
	// The warm-untouched scenario mutates nothing by design.
}

/**
 * Bump a file's mtime without changing its content.
 *
 * @param file - The absolute file path.
 */
function touch(file: string): void {
	const future = Date.now() / 1000 + 60;
	fs.utimesSync(file, future, future);
}

describe("buildinfo fast path", () => {
	it("agrees with the builder on a warm, untouched tree", () => {
		expect.assertions(3);

		const { builder, fast, fastPath } = compare({ mutate: unchanged, tree: CHAIN });

		expect(fast).toStrictEqual(builder);
		expect(fast.affected).toStrictEqual([]);
		expect(fastPath).toBe(true);
	});

	it("agrees with the builder when an mtime moved but the content did not", () => {
		expect.assertions(3);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				touch(path.join(directory, "src/a.ts"));
			},
			tree: CHAIN,
		});

		expect(fast).toStrictEqual(builder);
		expect(fast.affected).toStrictEqual([]);
		// Content-addressed, so a pure mtime bump must not cost a builder pass.
		expect(fastPath).toBe(true);
	});

	it("agrees with the builder on a real content change", () => {
		expect.assertions(3);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				writeFile(path.join(directory, "src/a.ts"), RESHAPED_A);
			},
			tree: CHAIN,
		});

		expect(fast).toStrictEqual(builder);
		expect(fast.affected).toStrictEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
		expect(fastPath).toBe(false);
	});

	it("agrees with the builder once that change has been persisted", () => {
		expect.assertions(3);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				writeFile(path.join(directory, "src/a.ts"), RESHAPED_A);
				runPass(directory);
			},
			tree: CHAIN,
		});

		expect(fast).toStrictEqual(builder);
		expect(fast.affected).toStrictEqual([]);
		expect(fastPath).toBe(true);
	});

	it("agrees with the builder when the tree is restored under a moved buildinfo", () => {
		expect.assertions(3);

		// The buildinfo ends up describing the *edited* text while the tree holds
		// the original: a file that reads as unchanged by mtime and as changed by
		// content, in the direction only the fast path could miss.
		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				const fileA = path.join(directory, "src/a.ts");
				writeFile(fileA, RESHAPED_A);
				runPass(directory);
				writeFile(fileA, ORIGINAL_A);
			},
			tree: CHAIN,
		});

		expect(fast).toStrictEqual(builder);
		expect(fast.affected).toStrictEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
		expect(fastPath).toBe(false);
	});

	it("agrees with the builder on a first run", () => {
		expect.assertions(3);

		const { builder, fast, fastPath } = compare({
			mutate: unchanged,
			tree: CHAIN,
			warm: false,
		});

		expect(fast).toStrictEqual(builder);
		expect(fast.firstRun).toBe(true);
		expect(fastPath).toBe(false);
	});

	it("agrees with the builder on a truncated buildinfo", () => {
		expect.assertions(2);

		const { builder, fast } = compare({
			mutate: (directory) => {
				for (const file of stateFiles(directory, "tsbuildinfo")) {
					fs.writeFileSync(file, fs.readFileSync(file, "utf8").slice(0, 400));
				}
			},
			tree: CHAIN,
		});

		// The fast path declines and hands over to the builder, whose own
		// `readBuilderProgram` then throws on the same file — so the run degrades
		// to a skipped pass. That is pre-existing behaviour, reproduced here only
		// to pin that the fast path neither hides it nor adds a throw of its own.
		// The gate-mtime observable says nothing about a run that aborted before
		// reaching the write, so this scenario asserts only the answers.
		expect(fast).toStrictEqual(builder);
		expect(fast.skipped).toBe(true);
	});

	it("agrees with the builder after a TypeScript version bump", () => {
		expect.assertions(2);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				for (const file of stateFiles(directory, "tsbuildinfo")) {
					fs.writeFileSync(file, JSON.stringify({ ...readJson(file), version: "0.0.0" }));
				}
			},
			tree: CHAIN,
		});

		expect(fast).toStrictEqual(builder);
		expect(fastPath).toBe(false);
	});
});

describe("buildinfo fast path root drift", () => {
	it("agrees with the builder when a tsconfig include gains a root", () => {
		expect.assertions(3);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				writeFile(path.join(directory, "tsconfig.json"), WIDE_TSCONFIG);
			},
			tree: { ...CHAIN, "extra/d.ts": "export function d() { return 4; }\n" },
		});

		expect(fast).toStrictEqual(builder);
		expect(fast.affected).toStrictEqual(["extra/d.ts"]);
		expect(fastPath).toBe(false);
	});

	it("agrees with the builder when a tsconfig include loses a root", () => {
		expect.assertions(2);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				writeFile(path.join(directory, "tsconfig.json"), TSCONFIG);
			},
			tree: {
				...CHAIN,
				"extra/d.ts": "export function d() { return 4; }\n",
				"tsconfig.json": WIDE_TSCONFIG,
			},
		});

		// A root only ever leaving the set is the direction a one-way membership
		// check would pass, which is why the comparison runs both ways.
		expect(fast).toStrictEqual(builder);
		expect(fastPath).toBe(false);
	});

	it("agrees with the builder when a root file is deleted", () => {
		expect.assertions(2);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				fs.rmSync(path.join(directory, "src/lonely.ts"));
			},
			tree: {
				"package.json": JSON.stringify({ name: "fixture", version: "0.0.0" }),
				"src/a.ts": ORIGINAL_A,
				"src/lonely.ts": "export function lonely() { return 2; }\n",
				"tsconfig.json": TSCONFIG,
			},
		});

		expect(fast).toStrictEqual(builder);
		expect(fastPath).toBe(false);
	});

	it("agrees with the builder when a node_modules declaration is deleted", () => {
		expect.assertions(2);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				fs.rmSync(path.join(directory, "node_modules/dep/index.d.ts"));
			},
			tree: {
				"node_modules/dep/index.d.ts": "export declare function dep(): number;\n",
				"node_modules/dep/package.json": JSON.stringify({
					name: "dep",
					types: "index.d.ts",
					version: "1.0.0",
				}),
				"package.json": JSON.stringify({ name: "fixture", version: "0.0.0" }),
				"src/a.ts": "import { dep } from 'dep';\nexport function a() { return dep(); }\n",
				"tsconfig.json": TSCONFIG,
			},
		});

		// A deleted dependency declaration is a mismatch to find, never a throw.
		expect(fast).toStrictEqual(builder);
		expect(fastPath).toBe(false);
	});
});

describe("buildinfo fast path resolution gate", () => {
	it("falls through when only the lockfile moved", () => {
		expect.assertions(2);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				writeFile(
					path.join(directory, "pnpm-lock.yaml"),
					"lockfileVersion: '9.0'\nimporters:\n  .: {}\n",
				);
			},
			tree: WORKSPACE,
		});

		// Nothing in the tree changed, so both answers are empty — but the fast
		// path must not be the one that says so: a dependency swap leaves every
		// retained store path hashing clean, and only the lockfile records it.
		expect(fast).toStrictEqual(builder);
		expect(fastPath).toBe(false);
	});

	it("falls through when the package type flips", () => {
		expect.assertions(2);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				writeFile(
					path.join(directory, "package.json"),
					JSON.stringify({
						name: "fixture",
						dependencies: { sibling: "workspace:*" },
						type: "module",
						version: "0.0.0",
					}),
				);
			},
			tree: WORKSPACE,
		});

		// `type` decides every file's `impliedFormat`, which the builder compares
		// and the fast path cannot see.
		expect(fast).toStrictEqual(builder);
		expect(fastPath).toBe(false);
	});

	it("falls through when a workspace sibling remaps its exports", () => {
		expect.assertions(2);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				writeFile(
					path.join(directory, "packages/sibling/package.json"),
					JSON.stringify({
						name: "sibling",
						exports: { ".": { types: "./other.d.ts" } },
						types: "index.d.ts",
						version: "1.0.0",
					}),
				);
			},
			tree: WORKSPACE,
		});

		// Neither the lockfile nor any source moves for this, and a sibling's
		// manifest is in no cache-bust pattern — the gate is the only thing
		// between it and a stale type-aware cache.
		expect(fast).toStrictEqual(builder);
		expect(fastPath).toBe(false);
	});

	it("still takes the fast path when an unrelated manifest field changes", () => {
		expect.assertions(2);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				writeFile(
					path.join(directory, "packages/sibling/package.json"),
					JSON.stringify({
						name: "sibling",
						description: "now documented",
						types: "index.d.ts",
						version: "1.0.0",
					}),
				);
			},
			tree: WORKSPACE,
		});

		expect(fast).toStrictEqual(builder);
		expect(fastPath).toBe(true);
	});
});

describe("buildinfo fast path unsupported shapes", () => {
	it("declines an outFile project", () => {
		expect.assertions(2);

		const { builder, fast, fastPath } = compare({
			mutate: unchanged,
			tree: {
				"package.json": JSON.stringify({ name: "fixture", version: "0.0.0" }),
				"src/a.ts": ORIGINAL_A,
				"tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "system",
						outFile: "./out.js",
						strict: true,
						target: "es2020",
					},
					include: ["src"],
				}),
			},
		});

		// That buildinfo has no referencedMap and a different fileInfos shape, so
		// verifying it against this check's model would be meaningless.
		expect(fast).toStrictEqual(builder);
		expect(fastPath).toBe(false);
	});
});

describe("buildinfo fast path encodings", () => {
	/**
	 * Write the UTF-16 source, which a `Tree` cannot carry: fixture trees are
	 * written as UTF-8.
	 *
	 * @param directory - The fixture project root.
	 * @param body - The body of its exported function.
	 */
	function writeUtf16(directory: string, body: string): void {
		fs.mkdirSync(path.join(directory, "src"), { recursive: true });
		fs.writeFileSync(
			path.join(directory, "src/wide.ts"),
			Buffer.from(`${BOM}export function wide() { return ${body}; }\n`, "utf16le"),
		);
	}

	it("takes the fast path across BOM and UTF-16 sources", () => {
		expect.assertions(3);

		const { builder, fast, fastPath } = compare({
			mutate: unchanged,
			prepare: (directory) => {
				writeUtf16(directory, "1");
			},
			tree: ENCODED,
		});

		// Reading these with `fs.readFileSync(file, "utf8")` leaves the BOM in
		// place and turns the UTF-16 file into mojibake, so both hash differently
		// forever and the fast path silently never fires again.
		expect(fast).toStrictEqual(builder);
		expect(fast.affected).toStrictEqual([]);
		expect(fastPath).toBe(true);
	});

	it("agrees with the builder on an edit to a UTF-16 source", () => {
		expect.assertions(3);

		const { builder, fast, fastPath } = compare({
			mutate: (directory) => {
				writeUtf16(directory, "2");
			},
			prepare: (directory) => {
				writeUtf16(directory, "1");
			},
			tree: ENCODED,
		});

		expect(fast).toStrictEqual(builder);
		expect(fast.affected).toStrictEqual(["src/wide.ts"]);
		expect(fastPath).toBe(false);
	});
});

describe("buildinfo fast path across a solution", () => {
	/**
	 * Drop the `app` project's state so it is cold while the library project
	 * stays warm — the mixed shape where one project must take each path.
	 *
	 * Which buildinfo is which is found by reading them, not by sorting names:
	 * each is suffixed with a digest of its tsconfig's (temp-directory) path,
	 * so the ordering differs between the two sides of a comparison.
	 *
	 * @param directory - The fixture project root.
	 */
	function coolAppProject(directory: string): void {
		for (const file of stateFiles(directory, "tsbuildinfo")) {
			const { fileNames } = readJson(file);
			if (
				!isStringArray(fileNames) ||
				fileNames.every((name) => !name.endsWith("app/b.ts"))
			) {
				continue;
			}

			const suffix = path.basename(file).slice("tsbuildinfo".length);
			fs.rmSync(file, { force: true });
			fs.rmSync(path.join(directory, STATE_DIRECTORY, `tsgate${suffix}`), { force: true });
		}
	}

	it("agrees with the builder when one project is cold and one is warm", () => {
		expect.assertions(3);

		const { builder, fast } = compare({ mutate: coolAppProject, tree: SOLUTION });

		expect(fast).toStrictEqual(builder);
		// One project had prior state, so the run as a whole is not a first run —
		// and the cold project still contributes its own files.
		expect(fast.firstRun).toBe(false);
		expect(fast.affected).toContain("app/b.ts");
	});

	it("takes the fast path for every project once all are warm", () => {
		expect.assertions(3);

		const { builder, fast, fastPath } = compare({ mutate: unchanged, tree: SOLUTION });

		expect(fast).toStrictEqual(builder);
		expect(fast.affected).toStrictEqual([]);
		expect(fastPath).toBe(true);
	});
});

describe("persisted buildinfo", () => {
	it("leaves no pending emit or change set behind", () => {
		expect.assertions(4);

		// Without this the feature evaporates silently: `persistBuilderState`
		// swallows every output but the buildinfo, and if that ever left emit
		// work recorded as pending, the fast path's first guard would decline
		// forever from the first edit onwards and no other test would notice.
		const directory = createFixture(CHAIN);
		runPass(directory);
		writeFile(path.join(directory, "src/a.ts"), RESHAPED_A);
		runPass(directory);

		const [file = ""] = stateFiles(directory, "tsbuildinfo");
		const info = readJson(file);

		expect(info["affectedFilesPendingEmit"]).toBeUndefined();
		expect(info["changeFileSet"]).toBeUndefined();
		expect(info["pendingEmit"]).toBeUndefined();
		expect(info["checkPending"]).toBeUndefined();
	});

	it("writes no JavaScript or declaration output into the project", () => {
		expect.assertions(1);

		const directory = createFixture(CHAIN);
		runPass(directory);

		expect(fs.readdirSync(path.join(directory, "src")).sort()).toStrictEqual([
			"a.ts",
			"b.ts",
			"c.ts",
		]);
	});
});
