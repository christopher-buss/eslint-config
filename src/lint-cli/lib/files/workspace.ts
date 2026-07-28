// cspell:words unparseable
import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";

import { isRecord } from "../../../guards.ts";
import { toPosix } from "../paths.ts";
import { readFileIfPresent } from "../state.ts";

/**
 * Markers that identify a repository or pnpm-workspace root. `.git` may be a
 * directory (normal clone) or a file (a worktree pointer); `existsSync` accepts
 * both.
 */
const WORKSPACE_ROOT_MARKERS = [".git", "pnpm-workspace.yaml"] as const;

/**
 * Workspace manifests {@link findWorkspaceMembers} reads package globs from.
 */
const PNPM_WORKSPACE_FILES = ["pnpm-workspace.yaml", "pnpm-workspace.yml"] as const;

/**
 * Directories the member walk never descends into. Deliberately minimal:
 * skipping a directory that turns out to hold a workspace member would make
 * that member's `package.json` invisible to the gate, which is the unsafe
 * direction. Neither of these can ever be one — pnpm refuses a package under
 * `node_modules`, and `.git` holds no manifest.
 */
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

/** Matches the top-level `packages:` key of a `pnpm-workspace.yaml`. */
const PACKAGES_KEY_PATTERN = /^packages\s*:/;

/** Matches one block-sequence item, capturing everything after its `-`. */
const SEQUENCE_ITEM_PATTERN = /^[\t ]*-[\t ]*(\S.*)$/;

/** Matches a scalar that opens YAML structure rather than a plain value. */
const YAML_STRUCTURE_PATTERN = /^[&*{[]/;

/** Splits a YAML file into lines, tolerating CRLF. */
const LINE_PATTERN = /\r?\n/;

/**
 * Deepest directory level the member walk visits when a pattern uses `**`,
 * which otherwise has no bounded depth. Every real workspace layout nests
 * members within a few segments of the root.
 */
const GLOBSTAR_DEPTH = 4;

/**
 * How many directory entries the member walk may look at before giving up.
 * Exhausting it yields `undefined` rather than a partial list: a partial list
 * reads as "these are all the members", which would silently drop the very
 * sibling whose manifest the caller needs to watch.
 */
const WALK_BUDGET = 8192;

/**
 * Walk up from `cwd` to the nearest directory that looks like a repository or
 * pnpm-workspace root (contains `.git` or `pnpm-workspace.yaml`). Returns `cwd`
 * unchanged when it is itself the root, or when no marker is found before the
 * filesystem root — in both cases there is no ancestor to fold in.
 *
 * @param cwd - The directory to walk up from.
 * @returns The workspace root, or `cwd` when there is no distinct ancestor root.
 */
export function findWorkspaceRoot(cwd: string): string {
	let current = cwd;
	for (;;) {
		for (const marker of WORKSPACE_ROOT_MARKERS) {
			if (fs.existsSync(path.join(current, marker))) {
				return current;
			}
		}

		const parent = path.dirname(current);
		if (parent === current) {
			// Reached the filesystem root without a marker: treat cwd as the root
			// so no ancestor directories are scanned.
			return cwd;
		}

		current = parent;
	}
}

/**
 * Every workspace member directory reachable from `root`: the directories its
 * package globs match that actually hold a `package.json`. A repository with no
 * workspace manifest yields an empty list.
 *
 * Returns `undefined` when the member set cannot be established — the globs are
 * present but unparseable, or the walk outgrew {@link WALK_BUDGET}. Callers
 * treat that as "unknown" and fall back to whatever they do without the member
 * list, never as "there are none".
 *
 * Negated patterns are dropped rather than applied, so an excluded directory
 * that still holds a manifest is reported as a member. Over-reporting only
 * costs an extra manifest read and a gate that churns slightly more often;
 * under-reporting would hide a real resolution change.
 *
 * @param root - The workspace root (see {@link findWorkspaceRoot}).
 * @returns The absolute member directories, or `undefined` when unknown.
 */
export function findWorkspaceMembers(root: string): Array<string> | undefined {
	const patterns = readWorkspacePatterns(root);
	if (patterns === undefined) {
		return undefined;
	}

	const positive = patterns.filter((pattern) => !pattern.startsWith("!"));
	if (positive.length === 0) {
		return [];
	}

	const isMember = picomatch(positive, { dot: true });
	const maxDepth = Math.max(...positive.map((pattern) => patternDepth(pattern)));
	const members: Array<string> = [];
	let budget = WALK_BUDGET;

	/**
	 * Visit one directory level, recording members and recursing while the
	 * deepest pattern can still match below.
	 *
	 * @param directory - The absolute directory to scan.
	 * @param depth - How many segments below the root it sits.
	 * @returns False when the walk ran out of budget.
	 */
	function walk(directory: string, depth: number): boolean {
		let entries: Array<fs.Dirent>;
		try {
			entries = fs.readdirSync(directory, { withFileTypes: true });
		} catch {
			return true;
		}

		for (const entry of entries) {
			if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) {
				continue;
			}

			budget -= 1;
			if (budget < 0) {
				return false;
			}

			const absolute = path.join(directory, entry.name);
			const relative = toPosix(path.relative(root, absolute));
			if (isMember(relative) && fs.existsSync(path.join(absolute, "package.json"))) {
				members.push(absolute);
			}

			if (depth < maxDepth && !walk(absolute, depth + 1)) {
				return false;
			}
		}

		return true;
	}

	return walk(root, 1) ? members : undefined;
}

/**
 * Reduce one YAML sequence item to its scalar value: strip matching quotes, or
 * cut an unquoted scalar at its trailing comment. Anything left holding YAML
 * structure — a nested mapping, a flow collection, an anchor or alias — is
 * rejected. A leading `*` is an alias, but `*` anywhere later is just a glob.
 *
 * @param item - The raw text after the item's `-`.
 * @returns The scalar, or `undefined` when it is not a plain one.
 */
function unquote(item: string): string | undefined {
	const [first] = item;
	if (first === '"' || first === "'") {
		const end = item.indexOf(first, 1);
		return end === -1 ? undefined : item.slice(1, end);
	}

	const [head = ""] = item.split(" #", 1);
	const value = head.trim();
	if (value === "" || YAML_STRUCTURE_PATTERN.test(value) || value.includes(": ")) {
		return undefined;
	}

	return value;
}

/**
 * Read a one-line flow sequence (`packages: ["a/*", "b/*"]`), which is JSON as
 * long as its scalars are double-quoted — the only form worth accepting here,
 * since anything else is better handled by declining.
 *
 * @param inline - The text after the `packages:` key.
 * @returns The glob patterns, or `undefined` when it is not plain JSON.
 */
function parseFlowSequence(inline: string): Array<string> | undefined {
	let flow: unknown;
	try {
		flow = JSON.parse(inline);
	} catch {
		return undefined;
	}

	if (!Array.isArray(flow)) {
		return undefined;
	}

	return flow.every((item) => typeof item === "string") ? flow : undefined;
}

/**
 * Read the top-level `packages:` sequence out of a `pnpm-workspace.yaml`
 * without a YAML parser — the key is always at column zero and its items are
 * plain scalars, in both the block and flow forms pnpm accepts. A file with no
 * `packages:` key declares no members.
 *
 * @param text - The workspace file's content.
 * @returns The glob patterns, or `undefined` when the key is unparseable.
 */
function parsePnpmPackages(text: string): Array<string> | undefined {
	const lines = text.split(LINE_PATTERN);
	const index = lines.findIndex((line) => PACKAGES_KEY_PATTERN.test(line));
	if (index === -1) {
		return [];
	}

	const header = lines[index] ?? "";
	const inline = header.slice(header.indexOf(":") + 1).trim();
	if (inline.startsWith("[")) {
		return parseFlowSequence(inline);
	}

	if (inline !== "" && !inline.startsWith("#")) {
		return undefined;
	}

	const items: Array<string> = [];
	const body = lines.slice(index + 1);
	for (const line of body) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) {
			continue;
		}

		const item = SEQUENCE_ITEM_PATTERN.exec(line)?.[1];
		if (item === undefined) {
			break;
		}

		const scalar = unquote(item);
		if (scalar === undefined) {
			return undefined;
		}

		items.push(scalar);
	}

	return items;
}

/**
 * The package globs a workspace root declares, from `pnpm-workspace.yaml` or
 * the npm/yarn `workspaces` field. An empty list means "no members";
 * `undefined` means the declaration exists but could not be read.
 *
 * @param root - The directory whose workspace declaration to read.
 * @returns The glob patterns, or `undefined` when undeterminable.
 */
function readWorkspacePatterns(root: string): Array<string> | undefined {
	for (const name of PNPM_WORKSPACE_FILES) {
		const raw = readFileIfPresent(path.join(root, name));
		if (raw !== undefined) {
			return parsePnpmPackages(raw);
		}
	}

	const manifest = readFileIfPresent(path.join(root, "package.json"));
	if (manifest === undefined) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(manifest);
	} catch {
		return undefined;
	}

	if (!isRecord(parsed)) {
		return undefined;
	}

	const { workspaces } = parsed;
	if (workspaces === undefined) {
		return [];
	}

	// npm and yarn both accept a bare array of globs; yarn also accepts the
	// object form, which nests them under `packages`.
	const globs = isRecord(workspaces) ? workspaces["packages"] : workspaces;
	if (!Array.isArray(globs)) {
		return undefined;
	}

	return globs.every((glob) => typeof glob === "string") ? globs : undefined;
}

/**
 * How many directory levels below the root a pattern can match at.
 *
 * @param pattern - One workspace package glob.
 * @returns The deepest level the walk must reach for it.
 */
function patternDepth(pattern: string): number {
	const segments = pattern.split("/").filter((segment) => segment !== "" && segment !== ".");
	return segments.includes("**") ? GLOBSTAR_DEPTH : Math.max(segments.length, 1);
}
