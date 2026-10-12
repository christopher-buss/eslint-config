import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";

import type { LintCliOptions } from "./types.ts";
import { CliError } from "./types.ts";

/** The `--files0-from` value that names stdin rather than a file. */
const STDIN_SOURCE = "-";

/**
 * Split a NUL-delimited, UTF-8 path list (the `git ls-files -z` / `find
 * -print0` shape) into its paths.
 *
 * Every path is terminated by a NUL, though the last terminator may be left off
 * as GNU's own `--files0-from` allows. Nothing else is interpreted: spaces,
 * newlines, quotes, shell metacharacters and leading hyphens all stay part of
 * the name. The bytes must be valid UTF-8 — a lossy decode would lint a file
 * that is not the one selected — and no entry may be empty, since an empty
 * path is never a file and most likely a broken producer.
 *
 * @param bytes - The raw list.
 * @returns The paths, in list order. Empty for an empty list.
 */
export function decodeFileList(bytes: Uint8Array): Array<string> {
	// `ignoreBOM` keeps a leading U+FEFF as part of the first name rather than
	// silently dropping it: the list is data, not a text document.
	const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
	let text: string;
	try {
		text = decoder.decode(bytes);
	} catch {
		throw new CliError("--files0-from: the file list is not valid UTF-8.");
	}

	if (text.length === 0) {
		return [];
	}

	const entries = text.split("\0");
	if (entries.at(-1) === "") {
		entries.pop();
	}

	const empty = entries.indexOf("");
	if (empty !== -1) {
		throw new CliError(
			`--files0-from: entry ${empty + 1} of the file list is empty; ` +
				"expected NUL-terminated paths.",
		);
	}

	return entries;
}

/**
 * Fill the run's paths from its `--files0-from` list, reading it once. Options
 * without a list are returned as they are.
 *
 * An empty list stays empty: the caller treats it as nothing to lint, and it
 * must never become the whole-tree default `.`.
 *
 * @param options - The parsed CLI options.
 * @param cwd - The directory a relative list path resolves against.
 * @param stdin - The stream `-` reads.
 * @returns The options with `paths` set from the list.
 * @rejects {CliError} When the list cannot be read or is malformed.
 */
export async function readFileList(
	options: LintCliOptions,
	cwd: string,
	stdin: AsyncIterable<unknown>,
): Promise<LintCliOptions> {
	const source = options.filesFrom;
	if (source === undefined) {
		return options;
	}

	const bytes = source === STDIN_SOURCE ? await readAll(stdin) : await readFile(source, cwd);
	return { ...options, paths: decodeFileList(bytes) };
}

async function readFile(source: string, cwd: string): Promise<Uint8Array> {
	try {
		return await fs.readFile(path.resolve(cwd, source));
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		throw new CliError(`--files0-from: cannot read "${source}": ${reason}`);
	}
}

async function readAll(stream: AsyncIterable<unknown>): Promise<Uint8Array> {
	const chunks: Array<Buffer> = [];
	for await (const chunk of stream) {
		if (typeof chunk === "string") {
			chunks.push(Buffer.from(chunk, "utf8"));
		} else if (chunk instanceof Uint8Array) {
			chunks.push(Buffer.from(chunk));
		} else {
			throw new CliError("--files0-from: stdin produced a non-byte chunk.");
		}
	}

	return Buffer.concat(chunks);
}
