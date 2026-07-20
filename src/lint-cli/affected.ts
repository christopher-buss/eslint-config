// cspell:words tsbuildinfo typeaware buildinfo mtimes normalised stabilise
// cspell:words unparseable slugified sanitise optimisation unsuffixed
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import type * as TypeScript from "typescript";

import { CACHE_KEY_LENGTH } from "./cache-key.ts";
import { toPosix } from "./paths.ts";
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
	/** The resolved project to build (see {@link collectProjects}). */
	project: ResolvedProject;
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
 * Resolve the builder incremental-state (`.tsbuildinfo`) file for a mode and
 * config variant. Stored under `node_modules/.cache/isentinel-lint/` so it
 * never pollutes the consumer's source tree and is cleaned with
 * `node_modules`.
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
export function builderStatePath(
	cwd: string,
	mode: TypeAwareMode | undefined,
	key: string,
	projectId: string,
): string {
	const suffix = mode === "only" ? "typeaware" : "full";
	return path.join(builderStateDirectory(cwd), `tsbuildinfo-${suffix}-${key}-${projectId}`);
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
 * @param key - The config-variant key from `resolveCacheKey`.
 * @returns The affected result, or `undefined` when skipped.
 */
export function computeAffectedFiles(
	cwd: string,
	mode: TypeAwareMode | undefined,
	key: string,
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
		fs.mkdirSync(builderStateDirectory(cwd), { recursive: true });

		const affected = new Set<string>();
		let warmProjects = 0;
		for (const project of projects) {
			const result = runBuilder({
				buildInfoPath: builderStatePath(cwd, mode, key, project.id),
				project,
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
 * The directory every builder state file lives in.
 *
 * @param cwd - The consumer project root.
 * @returns The absolute path to the runner's cache directory.
 */
function builderStateDirectory(cwd: string): string {
	return path.join(cwd, "node_modules", ".cache", "isentinel-lint");
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
 * @param builder - The drained builder program.
 * @param buildInfoPath - The variant's buildinfo file.
 */
function persistBuilderState(
	builder: TypeScript.EmitAndSemanticDiagnosticsBuilderProgram,
	buildInfoPath: string,
): void {
	const normalizedBuildInfo = path.normalize(buildInfoPath);
	builder.emit(undefined, (fileName, data) => {
		if (path.normalize(fileName) === normalizedBuildInfo) {
			fs.writeFileSync(fileName, data);
		}
	});
}

/**
 * Drive the incremental builder: read prior state, drain the affected set
 * without reporting diagnostics, then persist updated state.
 *
 * @param build - The project, its state file, and the run's shared handles.
 * @returns The affected result.
 */
function runBuilder({ buildInfoPath, project, ts }: BuilderRun): AffectedResult {
	const firstRun = !fs.existsSync(buildInfoPath);

	// Force the settings the shape-hash BFS depends on:
	// - `declaration: true` makes the builder derive each file's shape hash from
	//   its emitted `.d.ts` rather than raw source text, so a body-only edit
	//   (unchanged public surface) does NOT propagate to importers. Without it,
	//   the hash is the full-text hash and every dependent is invalidated.
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
		emitDeclarationOnly: false,
		incremental: true,
		noEmit: false,
		tsBuildInfoFile: buildInfoPath,
	};

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

	return { affected, firstRun };
}
