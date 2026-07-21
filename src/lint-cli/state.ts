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
 * Schema version stamped into every state file {@link writeState} produces. A
 * stored payload is only trusted when it was written by this version, so a CLI
 * upgrade that changes what a writer stores invalidates the old files instead
 * of silently misreading them — the config hash cannot catch this, since it
 * only says the *config* is unchanged. Bump this whenever any persisted payload
 * changes meaning. The builder's `.tsbuildinfo` files live in the same
 * directory but are written by TypeScript, which versions them itself.
 */
export const STATE_VERSION = 1;

/** How a stored value compared to the one {@link swapState} was given. */
export type StateSwap =
	/** The value differed and replaced the stored one. */
	| "changed"
	/** No usable state existed, so the value was stored as the baseline. */
	| "first"
	/** The stored value already matched; nothing was written. */
	| "unchanged";

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
 * @param parts - Further hyphen-joined segments, usually the config-variant key
 *   from `resolveCacheKey`. State that is consumed once (a stored hash, a
 *   drained builder) must carry that key, or the first variant to run absorbs
 *   the change on behalf of all of them.
 * @returns The absolute path to the state file.
 */
export function statePath(cwd: string, name: string, ...parts: Array<string>): string {
	return path.join(stateDirectory(cwd), [name, ...parts].join("-"));
}

/**
 * Read a UTF-8 file, or `undefined` when it cannot be read for any reason.
 * Shared by every tolerant read in the CLI: state files, and the config-import
 * closure walk.
 *
 * @param filePath - The file to read.
 * @returns The file's content, or `undefined`.
 */
export function readFileIfPresent(filePath: string): string | undefined {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}
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
/* oxlint-disable typescript/no-unnecessary-type-parameters -- T is the reader's assertion about what its own state file holds, which keeps the cast at one call site instead of at every use of the result. */
export function readState<T>(filePath: string): T | undefined {
	const raw = readFileIfPresent(filePath);
	return raw === undefined ? undefined : parseState<T>(raw);
}
/* oxlint-enable typescript/no-unnecessary-type-parameters */

/**
 * Persist a state payload, creating the cache directory as needed.
 *
 * The write is atomic (temp file plus rename), since `plan()` runs concurrently
 * across packages in a parallel per-package lint setup and a torn file would be
 * read back as "unknown" at best.
 *
 * Best-effort — a failed write leaves the state unknown, so the next run
 * recomputes rather than trusting something stale.
 *
 * @param filePath - The state file, from {@link statePath}.
 * @param data - The payload to store.
 */
export function writeState(filePath: string, data: unknown): void {
	const content = `${JSON.stringify({ data, version: STATE_VERSION } satisfies StateEnvelope<unknown>)}\n`;
	// One writer per process per file, so the pid keeps the temp name
	// collision-free across parallel package lints sharing a workspace root.
	const temporary = `${filePath}.${process.pid}.tmp`;
	try {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(temporary, content);
		fs.renameSync(temporary, filePath);
	} catch {
		try {
			fs.rmSync(temporary, { force: true });
		} catch {
			// The cleanup must not throw either: the factory writes the hybrid
			// status during config evaluation, which must never fail for this.
		}
	}
}

/**
 * Compare a value against the stored one and replace it when they differ, the
 * compare-and-swap every hash-drift bust runs: the caller acts on the outcome
 * and never on the stored value itself.
 *
 * The value is consumed by the swap — once stored, every later run reads back
 * `"unchanged"` — which is why hash state is keyed per config variant.
 *
 * A stored value this {@link STATE_VERSION} cannot read counts as `"changed"`,
 * so a CLI upgrade invalidates rather than silently adopts what it finds.
 *
 * @param filePath - The state file, from {@link statePath}.
 * @param value - The value this run computed.
 * @returns How the stored value compared.
 */
export function swapState(filePath: string, value: string): StateSwap {
	const raw = readFileIfPresent(filePath);
	const stored = raw === undefined ? undefined : parseState<string>(raw);
	if (stored === value) {
		return "unchanged";
	}

	writeState(filePath, value);
	// A file that exists but does not parse back — corrupt, or written by
	// another STATE_VERSION — counts as changed, not first. Something was
	// stored, and nothing can vouch for what the caches keyed to it hold, so
	// the caller must invalidate rather than adopt them.
	return raw === undefined ? "first" : "changed";
}

/**
 * Refresh a state file's mtime without rewriting it, so a reader comparing that
 * mtime against another file's still sees the state as fresh. Best-effort: a
 * missing file simply stays missing.
 *
 * @param filePath - The state file, from {@link statePath}.
 */
export function touchState(filePath: string): void {
	try {
		const now = Date.now() / 1000;
		fs.utimesSync(filePath, now, now);
	} catch {
		// The reader treats a missing or stale file as "unknown" and recomputes.
	}
}

/**
 * Parse one state file's content, or `undefined` when it is malformed or
 * carries another {@link STATE_VERSION}.
 *
 * @template T - The shape this file's writer stores (asserted, not checked).
 * @param raw - The file's content.
 * @returns The stored payload, or `undefined`.
 */
/* oxlint-disable typescript/no-unnecessary-type-parameters -- Mirrors readState's assertion; see its note. */
function parseState<T>(raw: string): T | undefined {
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
