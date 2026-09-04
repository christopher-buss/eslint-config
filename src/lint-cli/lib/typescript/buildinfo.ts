// cspell:words tsbuildinfo buildinfo unparseable
import path from "node:path";
import type * as TypeScript from "typescript";

import { isRecord } from "../../../guards.ts";
import { toPosix } from "../paths.ts";
import { readFileIfPresent, readState } from "../state.ts";

/** What {@link isBuildInfoUnchanged} needs to verify one project's state. */
export interface BuildInfoCheck {
	/** The variant's `.tsbuildinfo` file. */
	buildInfoPath: string;
	/** The absolute root file names the builder would compile. */
	fileNames: Array<string>;
	/** The state file holding the gate the builder last persisted under. */
	gatePath: string;
	/** The gate this run computed, or `undefined` when it is unknown. */
	gateValue: string | undefined;
	/** The resolved TypeScript module. */
	ts: typeof TypeScript;
}

/**
 * The fields of an incremental `.tsbuildinfo` this check reads. Every one is
 * `unknown`: the file is untrusted input, so the check validates what it needs
 * and treats any surprise as "cannot verify".
 */
interface IncrementalBuildInfo {
	affectedFilesPendingEmit?: unknown;
	changeFileSet?: unknown;
	checkPending?: unknown;
	fileInfos?: unknown;
	fileNames?: unknown;
	options?: unknown;
	pendingEmit?: unknown;
	resolvedRoot?: unknown;
	root?: unknown;
	version?: unknown;
}

/** The parts of a usable incremental buildinfo this check reads. */
interface UsableBuildInfo {
	/** The `fileInfos` entries, positionally paired with the names. */
	fileInfos: Array<unknown>;
	/** Every file in the program, relative to the buildinfo's directory. */
	names: Array<string>;
	/** The run-length-encoded root file ids (see {@link rootsMatch}). */
	root: unknown;
}

/**
 * TypeScript's own source-text version hash — the exact function that produced
 * the `fileInfos[].version` values in the buildinfo. It is on the runtime `ts`
 * object but absent from `typescript.d.ts`, so it is reached through one
 * narrowing here rather than reimplemented: a local copy would have to track
 * the compiler's inline-source-map stripping and hash choice, and would fail
 * silently (never matching, so never taking the fast path) if it ever drifted.
 */
type HashFromText = (host: TypeScript.System, text: string) => string;

/**
 * Whether the program described by an existing `.tsbuildinfo` is exactly the
 * one this run would compile — the question a full builder pass answers by
 * constructing a program, which on a large project costs seconds.
 *
 * TypeScript decides a file changed (`createBuilderProgramState`) when it is
 * absent from the old state, when its source-text `version` hash differs, when
 * its `impliedFormat` differs, when its `referencedMap` entry differs, or when
 * a file it referenced was deleted; plus, an old-state file that has left the
 * program and `affectsGlobalScope` invalidates everything. The
 * semantic-affected iterator is driven solely by that changed set, so nothing
 * else can produce an affected file — compiler-option drift included.
 *
 * This check reproduces the `version` test exactly (using TypeScript's own
 * hash, over text read through `ts.sys` so encodings and BOMs are handled the
 * way the compiler handles them) and the membership test for root files. It is
 * structurally blind to `impliedFormat` drift, `referencedMap` drift and
 * referenced-file deletion, all of which are resolution effects — the caller's
 * gate ({@link BuildInfoCheck.gateValue}, see `computeResolutionGate`) covers
 * those by digesting the manifests and lockfiles that decide resolution, and a
 * mismatching gate bails to the builder.
 *
 * Three residual gaps are accepted rather than covered, because closing them
 * costs the program construction this check exists to avoid:
 *
 * - An in-repo file that is not a root but shadows resolution: an ambient
 *   `.d.ts` added outside `include`, or a new `index.ts` that outranks a
 *   sibling of the same name.
 * - A hand-edited `node_modules` with no lockfile change.
 * - A pnpm store whose old link directories survive an update, so the paths the
 *   buildinfo names keep hashing clean. The lockfile hash in the gate moved,
 *   which is what catches it.
 *
 * Returns false — never throws — for every failure mode: a missing, torn,
 * truncated or foreign-version file, an unreadable source, pending emit work,
 * an `outFile` buildinfo, or symlinked roots.
 *
 * @param check - The buildinfo, its gate, and the roots to compare against.
 * @returns True when nothing the builder would notice has changed.
 */
export function isBuildInfoUnchanged({
	buildInfoPath,
	fileNames,
	gatePath,
	gateValue,
	ts,
}: BuildInfoCheck): boolean {
	try {
		const hashFromText = resolveHashFromText(ts);
		if (hashFromText === undefined) {
			return false;
		}

		if (gateValue === undefined || readState<string>(gatePath) !== gateValue) {
			return false;
		}

		const raw = readFileIfPresent(buildInfoPath);
		if (raw === undefined) {
			return false;
		}

		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) {
			return false;
		}

		const info: IncrementalBuildInfo = parsed;
		const usable = readUsableBuildInfo(info, ts);
		if (usable === undefined) {
			return false;
		}

		const directory = path.dirname(buildInfoPath);
		return (
			rootsMatch(usable, directory, fileNames, ts) &&
			versionsMatch(usable, directory, ts, hashFromText)
		);
	} catch {
		return false;
	}
}

/**
 * The compiler's version hash, or `undefined` when this TypeScript predates it
 * and the caller must take the builder path.
 *
 * @param ts - The resolved TypeScript module.
 * @returns The hash function (see {@link HashFromText}).
 */
function resolveHashFromText({
	getSourceFileVersionAsHashFromText,
}: typeof TypeScript): HashFromText | undefined {
	return typeof getSourceFileVersionAsHashFromText === "function"
		? getSourceFileVersionAsHashFromText
		: undefined;
}

/**
 * Whether a buildinfo list field carries entries. TypeScript omits these fields
 * entirely when they are empty, so anything present and non-empty is real
 * pending work.
 *
 * @param value - The field's value.
 * @returns True when the field holds at least one entry.
 */
function isNonEmpty(value: unknown): boolean {
	return Array.isArray(value) ? value.length > 0 : value !== undefined;
}

/**
 * Validate the buildinfo's envelope and return its two parallel arrays, or
 * `undefined` when anything about it disqualifies the fast path: a foreign
 * compiler version, a non-incremental or `outFile` shape, pending emit or check
 * work, symlinked roots, or arrays that do not line up.
 *
 * Pending work is fatal rather than merely informative: the builder would drain
 * it and re-persist, so a buildinfo carrying any is not the description of a
 * settled program.
 *
 * @param info - The parsed buildinfo.
 * @param ts - The resolved TypeScript module.
 * @returns The file names and file infos, or `undefined` when unusable.
 */
function readUsableBuildInfo(
	info: IncrementalBuildInfo,
	ts: typeof TypeScript,
): undefined | UsableBuildInfo {
	if (info.version !== ts.version) {
		return undefined;
	}

	if (isNonEmpty(info.changeFileSet) || isNonEmpty(info.affectedFilesPendingEmit)) {
		return undefined;
	}

	if (info.pendingEmit !== undefined || info.checkPending !== undefined) {
		return undefined;
	}

	// A root whose path differs from its resolved path (a symlink) is stored
	// under the resolved one, so `root` no longer lines up with the config's file
	// names and the membership comparison below would be meaningless.
	if (info.resolvedRoot !== undefined) {
		return undefined;
	}

	// The `outFile` buildinfo is a different shape entirely: no `referencedMap`,
	// a `fileInfos` list built from every file rather than the roots, and emit
	// semantics this check does not model.
	if (isRecord(info.options) && info.options["outFile"] !== undefined) {
		return undefined;
	}

	const { fileInfos, fileNames } = info;
	if (!Array.isArray(fileNames) || !Array.isArray(fileInfos) || !Array.isArray(info.root)) {
		return undefined;
	}

	if (fileNames.length !== fileInfos.length) {
		return undefined;
	}

	if (fileNames.some((name) => typeof name !== "string")) {
		return undefined;
	}

	return { fileInfos, names: fileNames, root: info.root };
}

/**
 * Expand a run-length-encoded file-id list into individual 1-based ids, or
 * `undefined` when the encoding is not one this understands.
 *
 * @param root - The buildinfo's `root` field.
 * @returns The ids it encodes.
 */
function expandRootIds(root: unknown): Array<number> | undefined {
	if (!Array.isArray(root)) {
		return undefined;
	}

	const ids: Array<number> = [];
	for (const entry of root) {
		if (typeof entry === "number") {
			ids.push(entry);
			continue;
		}

		if (!Array.isArray(entry)) {
			return undefined;
		}

		const [start, end] = entry as Array<unknown>;
		if (typeof start !== "number" || typeof end !== "number") {
			return undefined;
		}

		for (let id = start; id <= end; id += 1) {
			ids.push(id);
		}
	}

	return ids;
}

/**
 * Reduce a path to the form both sides of the root comparison are keyed by:
 * forward slashes, and case-folded only where the filesystem is
 * case-insensitive.
 *
 * @param filePath - The absolute path to canonicalize.
 * @param ts - The resolved TypeScript module.
 * @returns The canonical form.
 */
function canonical(filePath: string, ts: typeof TypeScript): string {
	const posix = toPosix(filePath);
	return ts.sys.useCaseSensitiveFileNames ? posix : posix.toLowerCase();
}

/**
 * Whether the buildinfo's root set is exactly the set of files the config
 * resolves now.
 *
 * The comparison uses `root` and not `fileNames`: `fileNames` is every file in
 * the program — lib files, `node_modules` declarations, transitively imported
 * sources — so it never equals the config's root list and would reject every
 * run. `root` stores 1-based ids into `fileNames`, run-length encoded as either
 * a bare id or a `[start, end]` pair.
 *
 * @param usable - The buildinfo's root ids and file names.
 * @param directory - The directory relative names resolve against.
 * @param fileNames - The absolute root file names the config resolves.
 * @param ts - The resolved TypeScript module.
 * @returns True when both sides hold the same roots.
 */
function rootsMatch(
	{ names, root }: UsableBuildInfo,
	directory: string,
	fileNames: Array<string>,
	ts: typeof TypeScript,
): boolean {
	const ids = expandRootIds(root);
	if (ids === undefined) {
		return false;
	}

	const stored = new Set<string>();
	for (const id of ids) {
		const name = names[id - 1];
		if (name === undefined) {
			return false;
		}

		stored.add(canonical(path.resolve(directory, name), ts));
	}

	// Both directions: a size check alone would pass a swap of one root for
	// another, and every root the config lists must be present.
	if (stored.size !== fileNames.length) {
		return false;
	}

	return fileNames.every((name) => stored.has(canonical(path.resolve(name), ts)));
}

/**
 * The source-text hash one `fileInfos` entry stores. A file whose version
 * equals its signature and carries nothing else is serialized as a bare
 * string; every other file becomes an object holding both.
 *
 * @param info - One `fileInfos` entry.
 * @returns The stored version hash, or `undefined` when the entry is not one.
 */
function storedVersion(info: unknown): string | undefined {
	if (typeof info === "string") {
		return info;
	}

	if (!isRecord(info)) {
		return undefined;
	}

	const { version } = info;
	return typeof version === "string" ? version : undefined;
}

/**
 * Whether every file the buildinfo describes still hashes to the version stored
 * for it. A file that has gone missing counts as a mismatch, not an error: the
 * builder would have reported its dependents affected.
 *
 * @param usable - The buildinfo's file names and file infos.
 * @param directory - The directory relative names resolve against.
 * @param ts - The resolved TypeScript module.
 * @param hashFromText - The compiler's own version hash.
 * @returns True when every stored version still matches the file on disk.
 */
function versionsMatch(
	{ fileInfos, names }: UsableBuildInfo,
	directory: string,
	ts: typeof TypeScript,
	hashFromText: HashFromText,
): boolean {
	for (const [index, name] of names.entries()) {
		const version = storedVersion(fileInfos[index]);
		if (version === undefined) {
			return false;
		}

		// `ts.sys.readFile` and not `fs.readFileSync`: it strips a UTF-8 BOM and
		// decodes UTF-16 exactly as the compiler does when it computes the hash
		// this is compared against. Reading the bytes any other way makes every
		// such file mismatch forever — a silent, permanent fallthrough that
		// nothing else would report.
		const text = ts.sys.readFile(path.resolve(directory, name));
		if (text === undefined) {
			return false;
		}

		if (hashFromText(ts.sys, text) !== version) {
			return false;
		}
	}

	return true;
}
