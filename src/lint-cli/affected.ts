// cspell:words tsbuildinfo typeaware buildinfo normalised stabilise
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import type * as TypeScript from "typescript";

import type { TypeAwareMode } from "./types.ts";

/** Result of a builder pass over the consumer's program. */
export interface AffectedResult {
	/**
	 * Absolute (OS-normalised) paths the TS builder flagged as affected,
	 * restricted to in-project files (node_modules and lib.*.d.ts excluded).
	 */
	affected: Set<string>;
	/**
	 * True when this run established the initial builder state (no prior
	 * buildinfo). A first run reports every file as affected, which is
	 * meaningless for invalidation — callers persist state but skip busting.
	 */
	firstRun: boolean;
}

let warned = false;

/**
 * Resolve the builder incremental-state (`.tsbuildinfo`) file for a mode.
 * Stored under `node_modules/.cache/isentinel-lint/` so it never pollutes the
 * consumer's source tree and is cleaned with `node_modules`.
 *
 * @param cwd - The consumer project root.
 * @param mode - The active ESLint type-aware mode (never `"off"` here).
 * @returns The absolute path to the mode's buildinfo file.
 */
export function builderStatePath(cwd: string, mode: TypeAwareMode | undefined): string {
	const suffix = mode === "only" ? "typeaware" : "full";
	return path.join(cwd, "node_modules", ".cache", "isentinel-lint", `tsbuildinfo-${suffix}`);
}

/**
 * Compute the set of files whose type-aware lint results may have changed since
 * the previous run, using TypeScript's builder API. The builder does a native
 * shape-hash BFS: it recomputes each dependent's emitted-`.d.ts` shape hash and
 * stops propagating where shapes stabilise, so an implementation-only edit
 * invalidates nothing downstream while an exported-type change invalidates its
 * transitive importers. Files that `affectsGlobalScope` invalidate everything.
 *
 * Returns `undefined` when the builder path is skipped or fails (no tsconfig,
 * `typescript` unresolvable, parse/build error) — callers then lint without
 * invalidation. Never throws.
 *
 * @param cwd - The consumer project root.
 * @param mode - The active ESLint type-aware mode.
 * @returns The affected result, or `undefined` when skipped.
 */
export function computeAffectedFiles(
	cwd: string,
	mode: TypeAwareMode | undefined,
): AffectedResult | undefined {
	const ts = loadTypescript(cwd);
	if (ts === undefined) {
		warnOnce("typescript is not resolvable; skipping type-aware cache invalidation");
		return undefined;
	}

	const configPath = ts.findConfigFile(cwd, (file) => ts.sys.fileExists(file), "tsconfig.json");
	if (configPath === undefined) {
		warnOnce("no tsconfig.json found; skipping type-aware cache invalidation");
		return undefined;
	}

	try {
		return runBuilder(ts, cwd, configPath, mode);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		warnOnce(`type-aware cache invalidation failed: ${message}`);
		return undefined;
	}
}

/**
 * Resolve the consumer's `typescript` and load it lazily. Anchored at `cwd` so
 * resolution walks the consumer's `node_modules` (typescript is a peer of
 * typescript-eslint, never a dependency of this package). Using `createRequire`
 * rather than a static import keeps typescript out of the bundle and off the
 * load path unless the builder actually runs.
 *
 * @param cwd - The consumer project root to resolve from.
 * @returns The TypeScript module, or `undefined` when it cannot be resolved.
 */
function loadTypescript(cwd: string): typeof TypeScript | undefined {
	try {
		const require = createRequire(path.join(cwd, "__isentinel-lint__.js"));
		return require("typescript") as typeof TypeScript;
	} catch {
		return undefined;
	}
}

function warnOnce(message: string): void {
	if (warned) {
		return;
	}

	warned = true;
	process.stderr.write(`isentinel-lint: ${message}\n`);
}

/**
 * Add a file to the affected set when it is an in-project file. Library
 * declarations and dependencies live under `node_modules` and are never in the
 * ESLint cache, so removing them would be a no-op and they would only inflate
 * the escape-valve threshold.
 *
 * @param fileName - The TypeScript file name (forward-slash absolute).
 * @param into - The accumulating affected set.
 */
function addProjectFile(fileName: string, into: Set<string>): void {
	const normalized = path.normalize(fileName);
	if (normalized.includes(`${path.sep}node_modules${path.sep}`)) {
		return;
	}

	into.add(normalized);
}

/**
 * Fold one affected target into the set. The builder yields a `SourceFile`
 * for a normal affected file, or the whole `Program` when a change affects
 * global scope (ambient/augmentation) — in which case every source file is
 * affected.
 *
 * @param target - The affected `Program` or `SourceFile`.
 * @param into - The accumulating affected set.
 */
function collectAffected(
	target: TypeScript.Program | TypeScript.SourceFile,
	into: Set<string>,
): void {
	if ("getSourceFiles" in target) {
		for (const sourceFile of target.getSourceFiles()) {
			addProjectFile(sourceFile.fileName, into);
		}

		return;
	}

	addProjectFile(target.fileName, into);
}

/**
 * Drive the incremental builder: read prior state, drain the affected set
 * without reporting diagnostics, then persist updated state.
 *
 * @param ts - The resolved TypeScript module.
 * @param cwd - The consumer project root.
 * @param configPath - The resolved tsconfig path.
 * @param mode - The active ESLint type-aware mode.
 * @returns The affected result.
 */
function runBuilder(
	ts: typeof TypeScript,
	cwd: string,
	configPath: string,
	mode: TypeAwareMode | undefined,
): AffectedResult | undefined {
	const configFile = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
	if (configFile.error !== undefined) {
		warnOnce("tsconfig.json could not be read; skipping type-aware cache invalidation");
		return undefined;
	}

	const basePath = path.dirname(configPath);
	const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, basePath);
	if (parsed.fileNames.length === 0) {
		return { affected: new Set(), firstRun: false };
	}

	const buildInfoPath = builderStatePath(cwd, mode);
	fs.mkdirSync(path.dirname(buildInfoPath), { recursive: true });
	const firstRun = !fs.existsSync(buildInfoPath);

	// Force the settings the shape-hash BFS depends on:
	// - `declaration: true` makes the builder derive each file's shape hash from
	//   its emitted `.d.ts` rather than raw source text, so a body-only edit
	//   (unchanged public surface) does NOT propagate to importers. Without it,
	//   the hash is the full-text hash and every dependent is invalidated.
	// - `incremental: true` + `tsBuildInfoFile` persist state in OUR cache dir.
	// - `composite`/`declarationMap` off, `noEmit` false: we DO emit so real
	//   `.d.ts` signatures are computed, but the emit `writeFile` (below)
	//   discards everything except the buildinfo, so nothing lands in the tree.
	const options: TypeScript.CompilerOptions = {
		...parsed.options,
		composite: false,
		declaration: true,
		declarationMap: false,
		emitDeclarationOnly: false,
		incremental: true,
		noEmit: false,
		tsBuildInfoFile: buildInfoPath,
	};

	const host = ts.createIncrementalCompilerHost(options, ts.sys);
	const oldProgram = ts.readBuilderProgram(options, host);
	const builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
		parsed.fileNames,
		options,
		host,
		oldProgram,
	);

	const affected = new Set<string>();
	let next = builder.getSemanticDiagnosticsOfNextAffectedFile();
	while (next !== undefined) {
		// We deliberately discard `next.result` (the diagnostics); only the
		// affected set matters here.
		collectAffected(next.affected, affected);
		next = builder.getSemanticDiagnosticsOfNextAffectedFile();
	}

	// Persist builder state by emitting ONLY the buildinfo. `program.emit` walks
	// remaining affected files and writes the `.tsbuildinfo`; the writeFile
	// callback swallows every other output so no JS/`.d.ts` reaches disk.
	const normalizedBuildInfo = path.normalize(buildInfoPath);
	builder.emit(undefined, (fileName, data) => {
		if (path.normalize(fileName) === normalizedBuildInfo) {
			fs.writeFileSync(fileName, data);
		}
	});

	return { affected, firstRun };
}
