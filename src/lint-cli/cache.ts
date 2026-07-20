import fileEntryCache from "file-entry-cache";
import fs from "node:fs";
import path from "node:path";

import { CACHE_FILE_PREFIX } from "./constants.ts";
import { toPosix } from "./paths.ts";

/**
 * A loaded ESLint cache, reused for both the dirty query and surgical removal.
 */
export interface DirtyCache {
	/**
	 * The candidate files that changed or are absent from the cache. Reads
	 * non-destructively — it never reconciles or writes the cache back.
	 *
	 * @param files - Absolute paths of the candidate files.
	 * @returns The files that need re-linting.
	 */
	getUpdatedFiles: (files: Array<string>) => Array<string>;
	/**
	 * Surgically drop the given files so they are re-linted next run, leaving
	 * every other entry intact, and persist the result.
	 *
	 * @param files - Absolute paths whose cache entries should be removed.
	 * @returns The number of entries actually removed.
	 */
	removeEntries: (files: Iterable<string>) => number;
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
 * Return true when any cache-bust file has been modified more recently than
 * the given cache file. A missing cache file returns false: the caller already
 * treats an absent cache as "everything is dirty".
 *
 * @param cacheFilePath - The ESLint cache file to compare against.
 * @param bustFiles - Files whose modification invalidates the cache.
 * @returns Whether the cache is stale.
 */
export function isCacheBusted(cacheFilePath: string, bustFiles: Array<string>): boolean {
	return isCacheStale(cacheFilePath, maxMtimeMs(bustFiles));
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
export function listCacheFiles(cwd: string): Array<string> {
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

/**
 * Delete every ESLint cache file the runner manages, across all variants.
 *
 * @param cwd - The working directory containing the cache files.
 */
export function clearAllCaches(cwd: string): void {
	for (const cacheFilePath of listCacheFiles(cwd)) {
		removeCacheFile(cacheFilePath);
	}
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
 * Normalize a path for cache-key comparison: absolute, forward-slash and
 * lower-cased. TypeScript emits forward-slash paths while ESLint keys the cache
 * with OS-native ones, and Windows paths are case-insensitive — this collapses
 * all of those into a single comparable form.
 *
 * @param filePath - The path to normalize.
 * @returns The canonical key.
 */
export function normalizePath(filePath: string): string {
	return toPosix(path.resolve(filePath)).toLowerCase();
}

/**
 * Open an ESLint cache for reuse, or `undefined` when the file is missing (the
 * caller then treats every target file as dirty). The returned handle backs
 * both {@link DirtyCache.getUpdatedFiles} and {@link DirtyCache.removeEntries}
 * so a pass parses the cache once instead of twice.
 *
 * @param cacheFilePath - The ESLint cache file to open.
 * @param useChecksum - Compare by content checksum instead of metadata.
 * @returns The loaded cache, or `undefined` when the file does not exist.
 */
export function openCache(cacheFilePath: string, useChecksum: boolean): DirtyCache | undefined {
	if (!fs.existsSync(cacheFilePath)) {
		return undefined;
	}

	// Reusing one handle for both getUpdatedFiles and removeEntries is safe:
	// verified against file-entry-cache@8 that getUpdatedFiles compares existing
	// entries without mutating the persisted store (nothing calls setKey), and
	// removeEntries' save(true) writes that store minus the removed keys.
	const cache = fileEntryCache.createFromFile(cacheFilePath, useChecksum);
	return {
		getUpdatedFiles: (files) => cache.getUpdatedFiles(files),
		removeEntries: (files) => removeEntriesFrom(cache, files),
	};
}

/**
 * List the files ESLint will actually re-lint: those changed or absent from
 * the cache. When the cache file is missing, every target file is dirty.
 *
 * @param cacheFilePath - The ESLint cache file to read.
 * @param files - Absolute paths of the candidate files.
 * @param useChecksum - Compare by content checksum instead of metadata.
 * @returns The candidate files that need re-linting.
 */
export function listDirtyFiles(
	cacheFilePath: string,
	files: Array<string>,
	useChecksum: boolean,
): Array<string> {
	return openCache(cacheFilePath, useChecksum)?.getUpdatedFiles(files) ?? [...files];
}

/**
 * Surgically drop the given files from an ESLint cache so they are re-linted on
 * the next run, leaving every other entry intact. This is the only write path
 * to the ESLint cache besides the whole-cache bust; used to invalidate files
 * whose type-aware results may have changed because a file they import changed.
 *
 * Matching is path-normalized (case-insensitive, separator-agnostic) because
 * TypeScript reports forward-slash paths while ESLint keys the cache with the
 * OS-native paths it linted. Persists via the underlying flat-cache with
 * pruning disabled, so untouched (unvisited) entries survive.
 *
 * @param cacheFilePath - The ESLint cache file to rewrite.
 * @param files - Absolute paths whose cache entries should be removed.
 * @returns The number of entries actually removed.
 */
export function removeCacheEntries(cacheFilePath: string, files: Iterable<string>): number {
	return openCache(cacheFilePath, false)?.removeEntries(files) ?? 0;
}

function safeMtimeMs(filePath: string): number | undefined {
	try {
		return fs.statSync(filePath).mtimeMs;
	} catch {
		return undefined;
	}
}

function removeCacheFile(cacheFilePath: string): void {
	try {
		fs.rmSync(cacheFilePath, { force: true });
	} catch {
		// Best effort; ESLint will rebuild the cache regardless.
	}
}

function removeEntriesFrom(
	cache: ReturnType<typeof fileEntryCache.createFromFile>,
	files: Iterable<string>,
): number {
	const keyByNormalized = new Map<string, string>();
	for (const key of cache.cache.keys()) {
		keyByNormalized.set(normalizePath(key), key);
	}

	let removed = 0;
	for (const file of files) {
		const key = keyByNormalized.get(normalizePath(file));
		if (key !== undefined) {
			cache.removeEntry(key);
			removed += 1;
		}
	}

	if (removed > 0) {
		// noPrune: keep every entry we did not explicitly remove.
		// `getUpdatedFiles` only reads the flat cache (never `setKey`), so
		// reusing a handle that already ran the dirty query persists the same
		// keys.
		cache.cache.save(true);
	}

	return removed;
}
