import fileEntryCache from "file-entry-cache";
import fs from "node:fs";
import path from "node:path";

import { ALL_CACHE_FILES } from "./constants.ts";

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
	const cacheMtime = safeMtimeMs(cacheFilePath);
	if (cacheMtime === undefined) {
		return false;
	}

	return bustFiles.some((file) => {
		const mtime = safeMtimeMs(file);
		return mtime !== undefined && mtime > cacheMtime;
	});
}

/**
 * Delete every ESLint cache file the runner manages.
 *
 * @param cwd - The working directory containing the cache files.
 */
export function clearAllCaches(cwd: string): void {
	for (const name of ALL_CACHE_FILES) {
		try {
			fs.rmSync(path.resolve(cwd, name), { force: true });
		} catch {
			// Best effort; ESLint will rebuild the cache regardless.
		}
	}
}

/**
 * List the files ESLint will actually re-lint: those changed or absent from
 * the cache. Reads the cache non-destructively — it never reconciles or writes
 * it back. When the cache file is missing, every target file is dirty.
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
	if (!fs.existsSync(cacheFilePath)) {
		return [...files];
	}

	const cache = fileEntryCache.createFromFile(cacheFilePath, useChecksum);
	return cache.getUpdatedFiles(files);
}

/**
 * Count the files ESLint will actually re-lint. Thin wrapper over
 * {@link listDirtyFiles}; see it for cache-read semantics.
 *
 * @param cacheFilePath - The ESLint cache file to read.
 * @param files - Absolute paths of the candidate files.
 * @param useChecksum - Compare by content checksum instead of metadata.
 * @returns The number of files that need re-linting.
 */
export function countDirtyFiles(
	cacheFilePath: string,
	files: Array<string>,
	useChecksum: boolean,
): number {
	return listDirtyFiles(cacheFilePath, files, useChecksum).length;
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
	return path.resolve(filePath).split(path.sep).join("/").toLowerCase();
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
	if (!fs.existsSync(cacheFilePath)) {
		return 0;
	}

	const cache = fileEntryCache.createFromFile(cacheFilePath, false);
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
		cache.cache.save(true);
	}

	return removed;
}

function safeMtimeMs(filePath: string): number | undefined {
	try {
		return fs.statSync(filePath).mtimeMs;
	} catch {
		return undefined;
	}
}
