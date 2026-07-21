import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * Directory (relative to the project root) where the CLI keeps its persisted
 * state. Lives under `node_modules/.cache` so it is discarded with the
 * dependency tree and never committed.
 */
const CACHE_DIRECTORY = path.join("node_modules", ".cache", "isentinel-lint");

/**
 * Schema version stamped into every state file. A stored shape is only trusted
 * when it was written by this version, so a CLI upgrade that changes what a
 * writer stores invalidates the old files instead of silently misreading them —
 * the config hash cannot catch this, since it only says the *config* is
 * unchanged. Bump this whenever any persisted state changes meaning.
 */
export const STATE_VERSION = 1;

/**
 * The on-disk envelope every {@link writeState} call produces.
 *
 * @template T - The writer's payload type.
 */
interface StateEnvelope<T> {
	/** The writer's own payload. */
	data: T;
	/** The {@link STATE_VERSION} the file was written by. */
	version: number;
}

/**
 * The directory every state file lives in.
 *
 * @param cwd - The consumer project root.
 * @returns The absolute path to the runner's cache directory.
 */
export function stateDirectory(cwd: string): string {
	return path.resolve(cwd, CACHE_DIRECTORY);
}

/**
 * Resolve one state file inside {@link stateDirectory}.
 *
 * @param cwd - The consumer project root.
 * @param name - The state's base name.
 * @param key - An optional discriminator appended to the name, usually the
 *   config-variant key from `resolveCacheKey`. State that is consumed once (a
 *   stored hash, a drained builder) must be keyed, or the first variant to run
 *   absorbs the change on behalf of all of them.
 * @returns The absolute path to the state file.
 */
export function statePath(cwd: string, name: string, key?: string): string {
	return path.join(stateDirectory(cwd), key === undefined ? name : `${name}-${key}`);
}

/**
 * Read a state file written by {@link writeState}. Every failure mode — the
 * file is missing, unreadable, malformed, or was written by another
 * {@link STATE_VERSION} — degrades to `undefined`, which every caller treats as
 * "unknown" and recomputes from.
 *
 * @template T - The shape this file's writer stores. Asserted, not checked:
 *   only the schema version is verified, exactly as the per-module casts this
 *   replaced did.
 * @param filePath - The state file, from {@link statePath}.
 * @returns The stored payload, or `undefined`.
 */
/* oxlint-disable typescript/no-unnecessary-type-parameters -- T is the caller's assertion about what its own state file holds, which keeps the cast at one call site instead of at every reader. */
export function readState<T>(filePath: string): T | undefined {
	const raw = readIfPresent(filePath);
	if (raw === undefined) {
		return undefined;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}

	if (typeof parsed !== "object" || parsed === null) {
		return undefined;
	}

	const envelope = parsed as Partial<StateEnvelope<T>>;
	return envelope.version === STATE_VERSION ? envelope.data : undefined;
}
/* oxlint-enable typescript/no-unnecessary-type-parameters */

/**
 * Persist a state payload, creating the cache directory as needed.
 *
 * The write is atomic (temp file plus rename), since `plan()` runs concurrently
 * across packages in a parallel per-package lint setup and a torn file would be
 * read back as "unknown" at best. Identical content is not rewritten, but its
 * mtime is refreshed: the hybrid-status freshness check compares that mtime
 * against the config's, and the factory rewrites the same content on every
 * config evaluation.
 *
 * Best-effort — a failed write leaves the state unknown, so the next run
 * recomputes rather than trusting something stale.
 *
 * @template T - The shape this file's writer stores.
 * @param filePath - The state file, from {@link statePath}.
 * @param data - The payload to store.
 * @returns True when the state is on disk.
 */
/* oxlint-disable typescript/no-unnecessary-type-parameters -- T lets a writer pin the shape it stores at the call site; the payload is otherwise `unknown` and unchecked. */
export function writeState<T>(filePath: string, data: T): boolean {
	const content = `${JSON.stringify({ data, version: STATE_VERSION } satisfies StateEnvelope<T>)}\n`;
	if (readIfPresent(filePath) === content) {
		try {
			const now = Date.now() / 1000;
			fs.utimesSync(filePath, now, now);
			return true;
		} catch {
			return false;
		}
	}

	// One writer per process per file, so the pid keeps the temp name
	// collision-free across parallel package lints sharing a workspace root.
	const temporary = `${filePath}.${process.pid}.tmp`;
	try {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(temporary, content);
		fs.renameSync(temporary, filePath);
		return true;
	} catch {
		fs.rmSync(temporary, { force: true });
		return false;
	}
}

/* oxlint-enable typescript/no-unnecessary-type-parameters */

function readIfPresent(filePath: string): string | undefined {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}
}
