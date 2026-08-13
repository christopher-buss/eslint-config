// cspell:words tsbuildinfo tsgate typeaware buildinfo mtimes normalised
// cspell:words stabilise unparseable slugified sanitise optimisation unsuffixed
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import type * as TypeScript from "typescript";

import type { TypeAwareMode } from "../cli/types.ts";
import { CACHE_KEY_LENGTH } from "../context.ts";
import type { RunContext } from "../context.ts";
import { toPosix } from "../paths.ts";
import { stateDirectory, statePath, writeState } from "../state.ts";
import { isBuildInfoUnchanged } from "./buildinfo.ts";
import { buildGateValue, computeResolutionGate } from "./gate.ts";
import { loadTypescript } from "./load.ts";

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

/** One resolved TypeScript project that actually owns source files. */
interface ResolvedProject {
	/** Digest of the project's config path, discriminating its buildinfo. */
	id: string;
	/** The absolute root file names the builder compiles. */
	fileNames: Array<string>;
	/** The project's own parsed compiler options. */
	options: TypeScript.CompilerOptions;
}

/** One builder pass over a single resolved project. */
interface BuilderRun {
	/** The variant's buildinfo file (see {@link builderStatePath}). */
	buildInfoPath: string;
	/** The buildinfo's gate state file (see {@link gateStatePath}). */
	gatePath: string;
	/** The resolved project to build (see {@link collectProjects}). */
	project: ResolvedProject;
	/**
	 * The run's resolution digest (see `computeResolutionGate`), or `undefined`
	 * when it could not be computed — which disables the fast path.
	 */
	resolutionGate: string | undefined;
	/** The resolved TypeScript module. */
	ts: typeof TypeScript;
}

/** Outcome of a project-reference walk (see {@link collectProjects}). */
interface ProjectWalkResult {
	/** False when the entry tsconfig itself could not be read. */
	entryReadable: boolean;
	/** Every file-owning project reachable from the entry config. */
	projects: Array<ResolvedProject>;
}

const warned = new Set<string>();

/**
 * State-file base name for the builder's incremental state, shared by the
 * per-project path and the prefix {@link hasBuilderState} scans for.
 */
const BUILD_INFO_STATE = "tsbuildinfo";

/**
 * State-file base name for the gate paired with each buildinfo. Deliberately
 * not a `tsbuildinfo-` suffix, so anything enumerating a variant's buildinfo
 * files does not pick a gate up as one (see {@link gateStatePath}).
 */
const GATE_STATE = "tsgate";

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
 * @param run - The run context.
 * @param mode - The active ESLint type-aware mode.
 * @returns The affected result, or `undefined` when skipped.
 */
export function computeAffectedFiles(
	{ key, cwd }: RunContext,
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
		const { entryReadable, projects } = collectProjects(ts, configPath);

		if (projects.length === 0) {
			// A parse failure already emitted a precise message naming the file,
			// so only the genuinely-empty case — a readable config whose files,
			// includes and references resolve to nothing — needs the generic one.
			if (entryReadable) {
				warnOnce(
					`no TypeScript files resolved from ${path.basename(configPath)}; ` +
						"skipping type-aware cache invalidation",
				);
			}

			return undefined;
		}

		// Every project's state lands in this one directory, so create it once
		// here rather than once per builder.
		fs.mkdirSync(stateDirectory(cwd), { recursive: true });

		// One digest for the whole run: the manifests and lockfiles it reads are
		// the consumer's, not any single project's, and a solution can hold
		// dozens of projects.
		const resolutionGate = computeResolutionGate(cwd);

		const affected = new Set<string>();
		let warmProjects = 0;
		for (const project of projects) {
			const result = runBuilder({
				buildInfoPath: builderStatePath(cwd, mode, key, project.id),
				gatePath: gateStatePath(cwd, mode, key, project.id),
				project,
				resolutionGate,
				ts,
			});

			warmProjects += result.firstRun ? 0 : 1;
			for (const file of result.affected) {
				affected.add(file);
			}
		}

		// The run counts as first only when NO project had prior state. Reporting
		// first-run because a *single* project is new would be unsafe: builders
		// are drained destructively, so every warm project's state would have
		// advanced while the caller discarded its affected set — leaving stale
		// cache entries whose mtimes never change and which nothing revisits.
		// A newly added project instead contributes its whole file set, which
		// over-invalidates (at worst tripping the bust threshold) rather than
		// under-invalidating.
		return { affected, firstRun: warmProjects === 0 };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		warnOnce(`type-aware cache invalidation failed: ${message}`);
		return undefined;
	}
}

/**
 * Whether a previous run left builder state for this mode and config variant.
 *
 * The one thing a builder pass does that nothing else can is establish this
 * state. Its affected set is disposable — a caller with an empty cache re-lints
 * regardless — but a run that skips the builder while no state exists only
 * defers the cost onto the next run, which then reports `firstRun` and throws
 * its affected set away. A file edited in between would be re-linted on its own
 * mtime while its importers kept stale type-aware cache entries, which no later
 * run revisits. Callers that skip the builder as an optimisation ask this
 * first.
 *
 * Any one project's state is enough: {@link computeAffectedFiles} reports
 * `firstRun` only when no project at all had state, and a newly added project
 * contributes its whole file set rather than an empty one.
 *
 * @param run - The run context.
 * @param mode - The active ESLint type-aware mode (never `"off"` here).
 * @returns True when at least one buildinfo for this mode and variant exists.
 */
export function hasBuilderState(
	{ key, cwd }: RunContext,
	mode: TypeAwareMode | undefined,
): boolean {
	// Named through the same `statePath` the buildinfo files themselves are,
	// minus the per-project digest, so the base name and the hyphen-join rule are
	// stated once. Spelling the prefix out here would let a rename slip past
	// silently: the scan would stop matching and the guard would degrade to
	// "always build", with no error and nothing to fail on.
	const prefix = `${path.basename(statePath(cwd, BUILD_INFO_STATE, modeSuffix(mode), key))}-`;
	try {
		// Both writers in this directory stage through a sibling
		// `<name>.<pid>.tmp` (see `persistBuilderState` and `writeState`), which
		// shares the prefix. A run killed mid-write leaves one behind for good,
		// and counting it as state would re-enable the skip with nothing on disk
		// to invalidate against.
		return fs
			.readdirSync(stateDirectory(cwd))
			.some((name) => name.startsWith(prefix) && !name.endsWith(".tmp"));
	} catch {
		return false;
	}
}

/**
 * The state-file segment discriminating the type-aware mode a builder ran
 * under. Two modes resolve different programs, so their state cannot be shared.
 *
 * @param mode - The active ESLint type-aware mode (never `"off"` here).
 * @returns The file-name segment for that mode.
 */
function modeSuffix(mode: TypeAwareMode | undefined): string {
	return mode === "only" ? "typeaware" : "full";
}

/**
 * Resolve the builder incremental-state (`.tsbuildinfo`) file for a mode and
 * config variant.
 *
 * The variant key is part of the path because this state is drained
 * destructively: {@link computeAffectedFiles} consumes the affected set and
 * advances the buildinfo, and the caller removes those files from *one* cache.
 * Sharing one buildinfo across variants would let an agent run advance the
 * state while only its own cache was invalidated; the next human run would
 * then see an empty affected set with stale entries still in its own warm
 * cache — and since those files' mtimes never changed, the typed pass would
 * auto-skip and report stale diagnostics that ESLint's `hashOfConfig` cannot
 * catch.
 *
 * @param cwd - The consumer project root.
 * @param mode - The active ESLint type-aware mode (never `"off"` here).
 * @param key - The config-variant key from `resolveCacheKey`.
 * @param projectId - {@link projectDigest} of the project's tsconfig. Every
 *   project is suffixed, including the entry one: a solution's members each
 *   need their own state, and an unsuffixed special case for the entry config
 *   would make `${key}` and `${key}-${digest}` ambiguous to parse back.
 * @returns The absolute path to the mode's buildinfo file.
 */
function builderStatePath(
	cwd: string,
	mode: TypeAwareMode | undefined,
	key: string,
	projectId: string,
): string {
	return statePath(cwd, BUILD_INFO_STATE, modeSuffix(mode), key, projectId);
}

/**
 * Resolve the gate state paired with one {@link builderStatePath} buildinfo:
 * the resolution and compiler-option digest that was true when the builder last
 * made that buildinfo describe the program.
 *
 * Written by the builder path only, never by the fast path, and never through
 * `swapState`. A compare-and-swap here would consume the change at read time
 * and open a hole with no symptom: an option flip would store the new digest,
 * fall through to the builder, and — if that builder then threw — leave the
 * buildinfo un-advanced with a gate that already claims to describe it. Every
 * later run would fast-path against state nothing ever updated.
 *
 * Named apart from the `tsbuildinfo-` prefix rather than suffixed onto it so
 * anything enumerating a variant's buildinfo files does not pick this up as
 * one.
 *
 * @param cwd - The consumer project root.
 * @param mode - The active ESLint type-aware mode (never `"off"` here).
 * @param key - The config-variant key from `resolveCacheKey`.
 * @param projectId - {@link projectDigest} of the project's tsconfig.
 * @returns The absolute path to the gate state file.
 */
function gateStatePath(
	cwd: string,
	mode: TypeAwareMode | undefined,
	key: string,
	projectId: string,
): string {
	return statePath(cwd, GATE_STATE, modeSuffix(mode), key, projectId);
}

/**
 * Emit a warning at most once per distinct message. Keyed by message rather
 * than a single global flag so per-project degradation (one unreadable
 * reference among many) stays reportable instead of being swallowed by an
 * earlier, unrelated warning.
 *
 * @param message - The warning text, also its dedupe key.
 */
function warnOnce(message: string): void {
	if (warned.has(message)) {
		return;
	}

	warned.add(message);
	process.stderr.write(`isentinel-lint: ${message}\n`);
}

/**
 * Derive a project's buildinfo discriminator from its canonical config path.
 * Hashed rather than slugified so nested paths stay short and two configs that
 * would sanitise to the same slug cannot collide.
 *
 * @param canonicalPath - The project's canonical tsconfig path.
 * @returns A filename-safe hex digest.
 */
function projectDigest(canonicalPath: string): string {
	return crypto
		.createHash("sha256")
		.update(canonicalPath)
		.digest("hex")
		.slice(0, CACHE_KEY_LENGTH);
}

/**
 * Walk the project-reference graph from an entry tsconfig, collecting every
 * project that owns files.
 *
 * `parseJsonConfigFileContent` does not follow `references`, so a
 * solution-style tsconfig (`files: []`, `include: []`) resolves to zero file
 * names on its own. Recursing gives referenced-project consumers real
 * cross-file invalidation instead of a silent no-op. References nest — a
 * referenced project may itself be solution-style — so this recurses rather
 * than reading one level, and the visited set guards against reference cycles
 * and diamond graphs.
 *
 * A referenced config that cannot be read is warned about and skipped rather
 * than failing the whole walk: one broken reference should degrade invalidation
 * for its own files, not for every sibling project.
 *
 * @param ts - The resolved TypeScript module.
 * @param entryPath - The tsconfig to start from.
 * @returns The file-owning projects and whether the entry config parsed.
 */
function collectProjects(ts: typeof TypeScript, entryPath: string): ProjectWalkResult {
	const projects: Array<ResolvedProject> = [];
	const seen = new Set<string>();
	let entryReadable = true;

	/**
	 * Canonical form of a config path, for cycle detection and digesting.
	 * TypeScript reaches the same file through differently-cased paths on a
	 * case-insensitive filesystem, so fold case only there. Folding
	 * unconditionally would collapse two genuinely distinct sibling configs
	 * on a case-sensitive filesystem into one — dropping all but the first
	 * from the walk and colliding their buildinfo digests.
	 *
	 * @param configPath - The path to canonicalize.
	 * @returns The canonical form.
	 */
	function canonical(configPath: string): string {
		const resolved = toPosix(path.resolve(configPath));
		return ts.sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase();
	}

	/**
	 * Visit one config, recording it when it owns files and recursing into its
	 * references.
	 *
	 * @param configPath - The tsconfig to resolve at this step.
	 */
	function walk(configPath: string): void {
		const key = canonical(configPath);
		if (seen.has(key)) {
			return;
		}

		seen.add(key);

		const configFile = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
		if (configFile.error !== undefined) {
			warnOnce(`${configPath} could not be read; its files skip type-aware invalidation`);
			if (configPath === entryPath) {
				entryReadable = false;
			}

			return;
		}

		const parsed = ts.parseJsonConfigFileContent(
			configFile.config,
			ts.sys,
			path.dirname(configPath),
		);

		if (parsed.fileNames.length > 0) {
			projects.push({
				id: projectDigest(key),
				fileNames: parsed.fileNames,
				options: parsed.options,
			});
		}

		const references = parsed.projectReferences ?? [];
		for (const reference of references) {
			walk(ts.resolveProjectReferencePath(reference));
		}
	}

	walk(entryPath);
	return { entryReadable, projects };
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
 * Persist the builder's incremental state by emitting ONLY the buildinfo.
 * `program.emit` walks remaining affected files and writes the `.tsbuildinfo`;
 * the writeFile callback swallows every other output so no JS/`.d.ts` reaches
 * the consumer's tree.
 *
 * The emit is what computes each file's real declaration signature, so it
 * cannot be swapped for the cheaper `emitBuildInfo`: without it the shape hash
 * degrades to a source-text hash and every implementation-only edit invalidates
 * all its importers.
 *
 * The buildinfo is written through a temp file and a rename. It has a second
 * reader now — {@link isBuildInfoUnchanged} parses it directly — and parallel
 * per-package lints share this directory, so a half-written file would be read
 * back as unparseable rather than merely re-emitted by the next builder.
 *
 * @param builder - The drained builder program.
 * @param buildInfoPath - The variant's buildinfo file.
 */
function persistBuilderState(
	builder: TypeScript.EmitAndSemanticDiagnosticsBuilderProgram,
	buildInfoPath: string,
): void {
	const normalizedBuildInfo = path.normalize(buildInfoPath);
	builder.emit(undefined, (fileName, data) => {
		if (path.normalize(fileName) !== normalizedBuildInfo) {
			return;
		}

		const temporary = `${fileName}.${process.pid}.tmp`;
		try {
			fs.writeFileSync(temporary, data);
			fs.renameSync(temporary, fileName);
		} catch (err) {
			fs.rmSync(temporary, { force: true });
			throw err;
		}
	});
}

/**
 * Record the gate the buildinfo was just persisted under, or remove it when the
 * gate could not be computed. Removal matters: a leftover value from an earlier
 * run would describe a resolution surface nothing has re-verified since.
 *
 * @param gatePath - The gate state file (see {@link gateStatePath}).
 * @param gateValue - The gate this run computed, or `undefined`.
 */
function writeGateState(gatePath: string, gateValue: string | undefined): void {
	if (gateValue === undefined) {
		fs.rmSync(gatePath, { force: true });
		return;
	}

	writeState(gatePath, gateValue);
}

/**
 * Drive the incremental builder: read prior state, drain the affected set
 * without reporting diagnostics, then persist updated state.
 *
 * A warm run whose buildinfo still describes the working tree exactly
 * ({@link isBuildInfoUnchanged}) short-circuits before any program is
 * constructed. That is the common case — a lint run where the previous one
 * already saw every edit — and constructing the program only to learn it costs
 * over a second on this repo, against under a tenth of that to verify the
 * buildinfo. The short circuit is strictly read-only: it persists nothing,
 * which is exactly what the builder does when it finds nothing affected.
 *
 * @param build - The project, its state files, and the run's shared handles.
 * @returns The affected result.
 */
function runBuilder({
	buildInfoPath,
	gatePath,
	project,
	resolutionGate,
	ts,
}: BuilderRun): AffectedResult {
	const firstRun = !fs.existsSync(buildInfoPath);

	// Force the settings the shape-hash BFS depends on:
	// - `declaration: true` makes the builder derive each file's shape hash from
	//   its emitted `.d.ts` rather than raw source text, so a body-only edit
	//   (unchanged public surface) does NOT propagate to importers. Without it,
	//   the hash is the full-text hash and every dependent is invalidated.
	// - `emitDeclarationOnly: true` drops JS emission, halving the outputs the
	//   persist produces only to throw away (measured on this repo: 428 files
	//   and 1.8MB down to 217 and 0.6MB). The shape hash is derived from the
	//   `.d.ts`, so nothing the BFS reads is lost. It buys no wall-clock time —
	//   the emit's cost is the declaration work, not the writing — so do not
	//   read it as a performance setting the fast path can lean on.
	// - `incremental: true` + `tsBuildInfoFile` persist state in OUR cache dir.
	// - `composite`/`declarationMap` off, `noEmit` false: see
	//   {@link persistBuilderState} for why we emit and what happens to it.
	//
	// Each project builds under its OWN options: a solution's members routinely
	// disagree (different `lib`, `types`, `jsx`), and forcing the entry config's
	// options onto all of them would resolve modules differently than the real
	// build and skew the shape hashes.
	//
	// Project references are deliberately NOT forwarded to the builder. With
	// `composite: false` the builder would look for referenced projects' emitted
	// `.d.ts` outputs, which need not exist; letting each program resolve
	// imports to sibling *sources* costs some duplicated work across projects
	// but keeps cross-project shape hashing real.
	const options: TypeScript.CompilerOptions = {
		...project.options,
		composite: false,
		declaration: true,
		declarationMap: false,
		emitDeclarationOnly: true,
		incremental: true,
		noEmit: false,
		tsBuildInfoFile: toPosix(buildInfoPath),
	};

	const gateValue = buildGateValue(resolutionGate, options);
	if (
		!firstRun &&
		isBuildInfoUnchanged({
			buildInfoPath,
			fileNames: project.fileNames,
			gatePath,
			gateValue,
			ts,
		})
	) {
		return { affected: new Set(), firstRun: false };
	}

	const host = ts.createIncrementalCompilerHost(options, ts.sys);
	const oldProgram = ts.readBuilderProgram(options, host);
	const builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
		project.fileNames,
		options,
		host,
		oldProgram,
	);

	const affected = new Set<string>();
	let touched = false;
	let next = builder.getSemanticDiagnosticsOfNextAffectedFile();
	while (next !== undefined) {
		// We deliberately discard `next.result` (the diagnostics); only the
		// affected set matters here. `touched` tracks the raw yield rather than
		// `affected.size`, which excludes node_modules: a dependency-only change
		// still advances builder state that must be persisted.
		touched = true;
		collectAffected(next.affected, affected);
		next = builder.getSemanticDiagnosticsOfNextAffectedFile();
	}

	// The builder found nothing affected, so the state on disk already describes
	// this program and re-emitting would reproduce it byte for byte. Skipping is
	// not just an optimisation: with the affected queue drained, `emit` falls
	// back to walking the WHOLE program, which on a large project costs tens of
	// seconds on every warm run — the common case this runner exists to make
	// fast.
	if (touched) {
		persistBuilderState(builder, buildInfoPath);
	}

	// Only now, with the buildinfo known to describe the tree this run saw, is
	// the gate allowed to move. Writing it earlier (or swapping it on read)
	// would let a throw between the two leave a gate vouching for a buildinfo
	// the builder never advanced.
	writeGateState(gatePath, gateValue);

	return { affected, firstRun };
}
