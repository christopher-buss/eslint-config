import path from "node:path";

/**
 * Matches a glob that anchors on one or more literal ancestor directory names,
 * capturing the run of literal segments that follows the leading `**\/`.
 *
 * `**\/scripts/**\/*.ts` captures `scripts/`, and `**\/.github/scripts/**\/*`
 * captures `.github/scripts/`. Basename anchors such as `**\/*config.ts` or
 * `**\/cli.ts` do not match, because the segment after `**\/` is not literal.
 */
const ANCESTOR_ANCHOR = /^\*\*\/((?:[^*?{}[\]/]+\/)+)/;

interface AncestorAnchor {
	/** The literal directory segments the pattern anchors on. */
	readonly segments: Array<string>;

	/** The remainder of the pattern, matched below the anchored directory. */
	readonly tail: string;
}

/**
 * Whether a glob anchors on a literal ancestor directory name.
 *
 * Such a pattern can never match when the config it belongs to already lives
 * inside the anchored directory: ESLint and oxlint both match `files` against
 * paths relative to the config's own directory, so the anchor segment is not
 * part of the path being tested. Basename anchors (`**\/*.spec.ts`) are immune
 * and return `false`.
 *
 * @param pattern - The glob to inspect.
 * @returns Whether the pattern depends on an ancestor directory name.
 */
export function hasAncestorDirectoryAnchor(pattern: string): boolean {
	return splitAncestorAnchor(pattern) !== undefined;
}

/**
 * Resolves a config directory to a workspace-root-relative path.
 *
 * Comparison has to happen in workspace-root-relative terms: matching against
 * absolute paths would let a checkout living at `C:\dev\scripts\repo` satisfy a
 * `**\/scripts/` anchor for every project in it.
 *
 * @param configDirectory - The absolute directory of the config being generated.
 * @param workspaceRoot - The absolute workspace root.
 * @returns The relative path with POSIX separators, or `undefined` when the
 *   config sits at or outside the workspace root.
 */
export function workspaceRelativeDirectory(
	configDirectory: string,
	workspaceRoot: string,
): string | undefined {
	const relative = path.relative(workspaceRoot, configDirectory);
	if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
		return undefined;
	}

	return relative.split(path.sep).join("/");
}

/**
 * Rewrites an ancestor-anchored glob so it still matches from a config that
 * already lives inside the anchored directory.
 *
 * The original pattern is always kept, so a directory of the same name nested
 * beneath the config keeps matching. When the config's own path already
 * satisfies the anchor, an additional anchor-stripped variant is emitted:
 * `**\/scripts/**\/*.ts` from a config at `scripts/` also yields `**\/*.ts`.
 *
 * A partial anchor is only honoured when it matches the tail of the config's
 * path — a config at `.github/foo` cannot satisfy `**\/.github/scripts/`,
 * because nothing below it lives in `.github/scripts`.
 *
 * This exists because oxlint has no per-override base path: `basePath` is a
 * hard parse error, and the upstream knob is still unresolved
 * (oxc-project/oxc#24276). The ESLint side uses `basePath` instead and needs no
 * rewrite.
 *
 * @param pattern - The glob to rewrite.
 * @param relativeConfigDirectory - The config's directory, relative to the workspace
 *   root, POSIX-separated.
 * @returns The patterns to emit, always including the original.
 */
export function rebaseAncestorAnchor(
	pattern: string,
	relativeConfigDirectory: string,
): Array<string> {
	const anchor = splitAncestorAnchor(pattern);
	if (anchor === undefined) {
		return [pattern];
	}

	const directorySegments = relativeConfigDirectory
		.split("/")
		.filter((segment) => segment !== "");
	if (directorySegments.length === 0) {
		return [pattern];
	}

	const { segments, tail } = anchor;

	for (let { length } = segments; length > 0; length -= 1) {
		const run = segments.slice(0, length);
		// A full anchor is satisfied by the directory name appearing anywhere
		// above the config; a partial one has to sit at the very end, so the
		// unmatched segments can still be found beneath the config.
		const satisfied =
			length === segments.length
				? containsRun(directorySegments, run)
				: endsWithRun(directorySegments, run);

		if (satisfied) {
			return [pattern, [...segments.slice(length), tail].join("/")];
		}
	}

	return [pattern];
}

/**
 * Splits a glob into its literal ancestor-directory anchor and the tail matched
 * beneath it.
 *
 * @param pattern - The glob to inspect.
 * @returns The anchor segments and tail, or `undefined` when the pattern is not
 *   anchored on an ancestor directory.
 */
function splitAncestorAnchor(pattern: string): AncestorAnchor | undefined {
	const match = ANCESTOR_ANCHOR.exec(pattern);
	if (match === null) {
		return undefined;
	}

	const [matched, literal] = match;
	if (literal === undefined) {
		return undefined;
	}

	const tail = pattern.slice(matched.length);
	if (tail === "") {
		return undefined;
	}

	return { segments: literal.split("/").filter((segment) => segment !== ""), tail };
}

/**
 * Whether `run` appears in `segments` as a contiguous slice ending at its end.
 *
 * @param segments - The segments to search.
 * @param run - The contiguous run to look for.
 * @returns Whether `segments` ends with `run`.
 */
function endsWithRun(segments: Array<string>, run: Array<string>): boolean {
	if (run.length > segments.length) {
		return false;
	}

	const offset = segments.length - run.length;
	return run.every((segment, index) => segments[offset + index] === segment);
}

/**
 * Whether `run` appears anywhere in `segments` as a contiguous slice.
 *
 * @param segments - The segments to search.
 * @param run - The contiguous run to look for.
 * @returns Whether `segments` contains `run`.
 */
function containsRun(segments: Array<string>, run: Array<string>): boolean {
	for (let start = 0; start + run.length <= segments.length; start += 1) {
		if (run.every((segment, index) => segments[start + index] === segment)) {
			return true;
		}
	}

	return false;
}
