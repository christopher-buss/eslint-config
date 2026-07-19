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
 * Count the files ESLint will actually re-lint: those changed or absent from
 * the cache. Reads the cache non-destructively — it never reconciles or writes
 * it back. When the cache file is missing, every target file is dirty.
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
	if (!fs.existsSync(cacheFilePath)) {
		return files.length;
	}

	const cache = fileEntryCache.createFromFile(cacheFilePath, useChecksum);
	return cache.getUpdatedFiles(files).length;
}

function safeMtimeMs(filePath: string): number | undefined {
	try {
		return fs.statSync(filePath).mtimeMs;
	} catch {
		return undefined;
	}
}
