import fileEntryCache from "file-entry-cache";
import type { FileEntryCache } from "file-entry-cache";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { toPosix } from "../paths.ts";
import { CACHE_FILE_PREFIX } from "./constants.ts";

// The platforms whose default filesystem reaches one file under either case.
// Both ship a case-sensitive option nobody defaults to; over-folding there is
// the behaviour every release before this one had. TypeScript's own
// `useCaseSensitiveFileNames` short-circuits on exactly these two, which is why
// the `canonical` helpers under `typescript/` can key off it and this cannot —
// they run only where TypeScript resolved, and this runs on every lint.
const CASE_INSENSITIVE_PLATFORMS = new Set<NodeJS.Platform>(["darwin", "win32"]);

/**
 * A loaded ESLint cache: the queries a pass runs against it, and the surgical
 * removal that writes it back.
 */
export interface DirtyCache {
	/**
	 * The candidate files whose cached result carries at least one message.
	 *
	 * ESLint stores each file's lint result beside its size and mtime, and
	 * replays it verbatim on a cache hit — which is why a warm check run still
	 * reports the whole repo. So the cache a check pass just wrote *is* that
	 * pass's verdict, and this reads the verdict back without linting again.
	 *
	 * Never writes the cache back.
	 *
	 * @param files - Absolute paths of the candidate files.
	 * @returns The candidates the pass had something to say about.
	 */
	filesWithMessages: (files: Array<string>) => Array<string>;
	/**
	 * The candidate files that changed or are absent from the cache. Never
	 * reconciles or writes the cache back.
	 *
	 * @param files - Absolute paths of the candidate files.
	 * @returns The files that need re-linting.
	 */
	getUpdatedFiles: (files: Array<string>) => Array<string>;
	/**
	 * Surgically drop the given files so they are re-linted next run, leaving
	 * every other entry intact, and persist the result. This is the only write
	 * path to the ESLint cache besides the whole-cache bust; used to invalidate
	 * files whose type-aware results may have changed because a file they
	 * import changed.
	 *
	 * Matching is path-normalized (see {@link normalizePath}) because
	 * TypeScript reports forward-slash paths while ESLint keys the cache with
	 * the OS-native paths it linted.
	 *
	 * @param files - Absolute paths whose cache entries should be removed.
	 * @returns The number of entries actually removed.
	 */
	removeEntries: (files: Iterable<string>) => number;
}

/**
 * The slice of a cache entry the runner reads: the lint result ESLint stores
 * beside the file's size and mtime and replays for an unchanged file. A
 * non-empty message list is a file the last check run had something to say
 * about.
 */
interface CachedEntry {
	data?: { results?: { messages?: Array<unknown> } };
}

/**
 * Compute the newest modification time across the given files. Callers hash the
 * cache-bust set once per run and compare each pass's cache mtime against the
 * result, rather than re-reading every bust file's mtime per pass.
 *
 * @param files - Absolute paths to stat.
 * @returns The newest mtime in milliseconds, or `undefined` when none exist.
 */
export function maxMtimeMs(files: Iterable<string>): number | undefined {
	let newest: number | undefined;
	for (const file of files) {
		const mtime = safeMtimeMs(file);
		if (mtime !== undefined && (newest === undefined || mtime > newest)) {
			newest = mtime;
		}
	}

	return newest;
}

/**
 * Whether the cache file is older than the newest cache-bust modification. A
 * missing cache file (or no bust files) returns false: the caller already
 * treats an absent cache as "everything is dirty".
 *
 * @param cacheFilePath - The ESLint cache file to compare against.
 * @param newestBustMtimeMs - The newest bust-file mtime (see {@link maxMtimeMs}).
 * @returns Whether the cache is stale.
 */
export function isCacheStale(
	cacheFilePath: string,
	newestBustMtimeMs: number | undefined,
): boolean {
	if (newestBustMtimeMs === undefined) {
		return false;
	}

	const cacheMtime = safeMtimeMs(cacheFilePath);
	if (cacheMtime === undefined) {
		return false;
	}

	return newestBustMtimeMs > cacheMtime;
}

/**
 * Delete the individually stale cache files in the working directory.
 *
 * Deliberately per-file rather than all-or-nothing: variants this run did not
 * select still sit on disk, and {@link isCacheStale} reports a missing file as
 * fresh. An all-or-nothing gate over only the selected passes therefore lets an
 * unselected-but-stale variant survive a config edit, then wipes every fresh
 * variant the next time that stale one is selected — the same mutual
 * invalidation the variant split exists to remove, relocated to the config-edit
 * path.
 *
 * @param cwd - The working directory containing the cache files.
 * @param newestBustMtimeMs - The newest bust-file mtime (see {@link maxMtimeMs}).
 * @returns The absolute paths deleted.
 */
export function sweepStaleCaches(
	cwd: string,
	newestBustMtimeMs: number | undefined,
): Array<string> {
	const removed: Array<string> = [];
	for (const cacheFilePath of listCacheFiles(cwd)) {
		if (!isCacheStale(cacheFilePath, newestBustMtimeMs)) {
			continue;
		}

		removeCacheFile(cacheFilePath);
		removed.push(cacheFilePath);
	}

	return removed;
}

/**
 * Normalize a path for cache-key comparison: absolute and forward-slash, plus
 * lower-cased where the platform's filesystem is case-insensitive. TypeScript
 * emits forward-slash paths while ESLint keys the cache with OS-native ones,
 * and Windows and macOS reach the same file under either case — this collapses
 * all of those into a single comparable form.
 *
 * Case survives everywhere else: on a case-sensitive filesystem `src/Foo.ts`
 * and `src/foo.ts` are two files with two cache entries, and folding them
 * together would let one shadow the other's verdict.
 *
 * @param filePath - The path to normalize.
 * @param platform - The platform whose filesystem the paths live on.
 * @returns The canonical key.
 */
export function normalizePath(
	filePath: string,
	platform: NodeJS.Platform = process.platform,
): string {
	const resolved = toPosix(path.resolve(filePath));
	return CASE_INSENSITIVE_PLATFORMS.has(platform) ? resolved.toLowerCase() : resolved;
}

/**
 * Open an ESLint cache for reuse, or `undefined` when the file is missing (the
 * caller then treats every target file as dirty).
 *
 * The two reads share one parsed handle. The removal parses its own, because
 * asking a cache which files changed restamps every entry it looked at with
 * that file's current size and mtime: persisting that handle would hand ESLint
 * the previous run's results under a stamp saying they are current.
 *
 * @param cacheFilePath - The ESLint cache file to open.
 * @param useChecksum - Compare by content checksum instead of metadata.
 * @returns The loaded cache, or `undefined` when the file does not exist.
 */
export function openCache(cacheFilePath: string, useChecksum: boolean): DirtyCache | undefined {
	if (!fs.existsSync(cacheFilePath)) {
		return undefined;
	}

	const cache = load(cacheFilePath, useChecksum);
	return {
		filesWithMessages: (files) => filesWithMessagesIn(cache, files),
		getUpdatedFiles: (files) => cache.getUpdatedFiles(files),
		removeEntries: (files) => removeEntriesFrom(load(cacheFilePath, useChecksum), files),
	};
}

function safeMtimeMs(filePath: string): number | undefined {
	try {
		return fs.statSync(filePath).mtimeMs;
	} catch {
		return undefined;
	}
}

/**
 * List every ESLint cache file present in the working directory, matched by
 * prefix rather than by exact name: each pass's cache carries a config-variant
 * key suffix, so the set on disk is open-ended and an exact-name list would
 * miss (and therefore leak) every variant but the current run's.
 *
 * @param cwd - The working directory containing the cache files.
 * @returns Absolute paths to the cache files found.
 */
function listCacheFiles(cwd: string): Array<string> {
	let entries: Array<string>;
	try {
		entries = fs.readdirSync(cwd);
	} catch {
		return [];
	}

	return entries
		.filter((entry) => entry.startsWith(CACHE_FILE_PREFIX))
		.map((entry) => path.resolve(cwd, entry));
}

function removeCacheFile(cacheFilePath: string): void {
	try {
		fs.rmSync(cacheFilePath, { force: true });
	} catch {
		// Best effort; ESLint will rebuild the cache regardless.
	}
}

/**
 * Load a cache file the way ESLint's own `LintResultCache` does. The two read
 * and write the same entries, and a reader whose change detection disagrees
 * with the writer's reports every file as dirty.
 *
 * @param cacheFilePath - The ESLint cache file to load.
 * @param useChecksum - Compare by content checksum instead of metadata.
 * @returns The loaded cache.
 */
function load(cacheFilePath: string, useChecksum: boolean): FileEntryCache {
	return fileEntryCache.createFromFile(cacheFilePath, {
		useCheckSum: useChecksum,
		useModifiedTime: !useChecksum,
	});
}

/**
 * Index a cache's entry keys by their normalized form, so a caller holding
 * paths from elsewhere — TypeScript's forward slashes, a git listing — can find
 * the entry ESLint wrote under an OS-native path.
 *
 * @param cache - The loaded cache to index.
 * @returns Normalized path to the key the cache stores it under.
 */
function keysByNormalizedPath(cache: FileEntryCache): Map<string, string> {
	const keyByNormalized = new Map<string, string>();
	for (const key of cache.cache.keys()) {
		keyByNormalized.set(normalizePath(key), key);
	}

	return keyByNormalized;
}

function filesWithMessagesIn(cache: FileEntryCache, files: Array<string>): Array<string> {
	const keyByNormalized = keysByNormalizedPath(cache);
	return files.filter((file) => {
		const key = keyByNormalized.get(normalizePath(file));
		if (key === undefined) {
			return false;
		}

		const messages = cache.cache.getKey<CachedEntry | undefined>(key)?.data?.results?.messages;
		return messages !== undefined && messages.length > 0;
	});
}

function removeEntriesFrom(cache: FileEntryCache, files: Iterable<string>): number {
	const keyByNormalized = keysByNormalizedPath(cache);

	let removed = 0;
	for (const file of files) {
		const key = keyByNormalized.get(normalizePath(file));
		if (key !== undefined) {
			cache.removeEntry(key);
			removed += 1;
		}
	}

	if (removed > 0) {
		// The flat cache writes back whatever it holds, so every entry this
		// handle did not remove survives.
		cache.cache.save();
	}

	return removed;
}
