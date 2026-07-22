import path from "node:path";

/**
 * Rewrite a path to forward slashes. The shared separator-splitting primitive
 * that both the cache-key `normalizePath` and the file walk build on, so there
 * is a single place that translates OS-native separators to POSIX.
 *
 * @param value - The path to rewrite.
 * @returns The path with every separator as a forward slash.
 */
export function toPosix(value: string): string {
	return value.split(path.sep).join("/");
}
