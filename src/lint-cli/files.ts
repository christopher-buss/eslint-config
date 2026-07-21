// cspell:words lintable pathspec
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";

import { normalizePath } from "./cache.ts";
import {
	CACHE_BUST_PATTERNS,
	ESLINT_CONFIG_FILE_PATTERN,
	LINTABLE_EXTENSIONS,
	TYPE_AWARE_EXTENSIONS,
} from "./constants.ts";
import { toPosix } from "./paths.ts";
import { findWorkspaceRoot } from "./workspace.ts";

// Per-directory (single-segment) forms of the cache-bust globs: strip the
// leading `**/` so each matches against a bare basename. Used to scan the
// cache-bust candidates in each workspace-root ancestor directory, which a
// sub-package `git ls-files` never lists.
const ANCESTOR_BUST_PATTERNS = CACHE_BUST_PATTERNS.map((pattern) => {
	return pattern.startsWith("**/") ? pattern.slice(3) : pattern;
});

// Only reached in the non-git fallback walk; inside a repo `git ls-files`
// already applies `.gitignore`. The canonical ignore knowledge lives in
// `src/globs.ts` GLOB_EXCLUDE — keep this in rough sync with it.
const IGNORED_WALK_DIRECTORIES = new Set([
	".git",
	".next",
	".turbo",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"out",
]);

const LINTABLE_EXTENSION_SET = new Set<string>(
	LINTABLE_EXTENSIONS.map((extension) => `.${extension}`),
);

const TYPE_AWARE_EXTENSION_SET = new Set<string>(
	TYPE_AWARE_EXTENSIONS.map((extension) => `.${extension}`),
);

/**
 * The repository file lists a run needs, all derived from one `git ls-files`.
 */
export interface RepoFiles {
	/** Absolute paths of every cache-busting file (whole project). */
	bustFiles: Array<string>;
	/**
	 * The flat-config entry-point subset of {@link RepoFiles.bustFiles} — the
	 * files whose change should invalidate a config-derived signal (the hybrid
	 * status and the config-drift hash). Derived once here so consumers do not
	 * each re-filter `bustFiles`.
	 */
	configFiles: Array<string>;
	/** Absolute paths of the lintable files within the lint targets. */
	lintable: Array<string>;
	/**
	 * True when a lint target resolves outside `cwd` (a `..`-prefixed relative
	 * path, or an absolute path not under `cwd`). Such targets are absent from
	 * the cwd-relative listing, so it under-counts them; the runner then must
	 * not auto-skip the typed pass, and sizes conservatively.
	 */
	targetsOutsideCwd: boolean;
	/** The type-aware (TS/JS-family) subset of {@link RepoFiles.lintable}. */
	typeAware: Array<string>;
}

/**
 * Collect every file list a run needs from a single whole-project
 * `git ls-files` (honouring `.gitignore`), rather than re-spawning git for each
 * pass. The one scan feeds three filters: the cache-bust set (config files,
 * tsconfigs, lockfiles — always whole-project), the lintable files restricted
 * to `targets`, and their type-aware subset.
 *
 * @param cwd - The project root to scan.
 * @param targets - The lint target paths that restrict the lintable set.
 * @returns The cache-bust, lintable and type-aware file lists.
 */
export function collectRepoFiles(cwd: string, targets: Array<string>): RepoFiles {
	const relatives = listFiles(cwd, ["."]);
	const isBustFile = picomatch([...CACHE_BUST_PATTERNS], { dot: true });
	const normalizedTargets = targets.map((target) => normalizeTarget(target, cwd));
	const targetsOutsideCwd = normalizedTargets.some((target) => isOutsideCwd(target));
	const isWithinTargets = matchTargets(normalizedTargets);

	const bustFiles = collectAncestorBustFiles(cwd);
	const lintable: Array<string> = [];
	const typeAware: Array<string> = [];
	for (const relative of relatives) {
		if (isBustFile(relative)) {
			bustFiles.push(path.resolve(cwd, relative));
		}

		if (isWithinTargets(relative) && hasLintableExtension(relative)) {
			const absolute = path.resolve(cwd, relative);
			lintable.push(absolute);
			if (isTypeAwareFile(relative)) {
				typeAware.push(absolute);
			}
		}
	}

	const configFiles = bustFiles.filter(isConfigEntryPoint);

	return { bustFiles, configFiles, lintable, targetsOutsideCwd, typeAware };
}

/**
 * Drop the files ESLint declines to lint from the *target* lists, leaving the
 * rest of the listing untouched.
 *
 * Only the `lintable` and `typeAware` lists are lint targets. The `bustFiles`
 * and `configFiles` lists are whole-project cache-bust inputs — a tsconfig or
 * lockfile is never linted, so filtering them by "would ESLint lint this" would
 * empty them. Any list added to {@link RepoFiles} later has to make that same
 * choice here, which is why this lives beside the type rather than at the call
 * site.
 *
 * @param files - The collected repository files.
 * @param ignored - The ignored set from `resolveIgnoredFiles` (normalized keys).
 * @returns The listing with its target lists filtered.
 */
export function withoutIgnored(files: RepoFiles, ignored: ReadonlySet<string>): RepoFiles {
	return {
		...files,
		lintable: retained(files.lintable, ignored),
		typeAware: retained(files.typeAware, ignored),
	};
}

/**
 * Collect the absolute paths of lintable files under `targets`, honouring
 * `.gitignore` (via `git ls-files`) when inside a git repository. Thin wrapper
 * over {@link collectRepoFiles}.
 *
 * @param cwd - The working directory to resolve targets against.
 * @param targets - The target paths to scan.
 * @returns The absolute paths of lintable files.
 */
export function collectLintableFiles(cwd: string, targets: Array<string>): Array<string> {
	return collectRepoFiles(cwd, targets).lintable;
}

/**
 * Whether an absolute path is a flat-config entry point.
 *
 * @param file - The absolute path to test.
 * @returns True when the basename matches `eslint.config.*`.
 */
function isConfigEntryPoint(file: string): boolean {
	return ESLINT_CONFIG_FILE_PATTERN.test(path.basename(file));
}

/**
 * Scan the single-segment cache-bust candidates in each directory from `cwd`'s
 * parent up to and including the workspace root. A sub-package `git ls-files`
 * only lists files under `cwd`, so a hoisted root lockfile, tsconfig or ESLint
 * config change would otherwise never bust the caches. Returns absolute paths
 * (fine for mtime comparison); empty when `cwd` is itself the root.
 *
 * @param cwd - The project (sub-package) root to walk up from.
 * @returns Absolute paths of the ancestor cache-bust files.
 */
function collectAncestorBustFiles(cwd: string): Array<string> {
	const root = findWorkspaceRoot(cwd);
	if (root === cwd) {
		return [];
	}

	const isBustName = picomatch([...ANCESTOR_BUST_PATTERNS], { dot: true });
	const found: Array<string> = [];
	let current = path.dirname(cwd);
	for (;;) {
		let entries: Array<fs.Dirent> = [];
		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch {
			entries = [];
		}

		for (const entry of entries) {
			if (entry.isFile() && isBustName(entry.name)) {
				found.push(path.join(current, entry.name));
			}
		}

		const parent = path.dirname(current);
		if (current === root || parent === current) {
			break;
		}

		current = parent;
	}

	return found;
}

/**
 * Reduce a raw target to the cwd-relative posix form the listing is keyed by.
 * Absolute targets (including Windows drive paths) are relativized against
 * `cwd`; `./` prefixes and trailing slashes are stripped. A target that
 * resolves to `cwd` itself becomes `""` (match-all). Targets outside `cwd` keep
 * their `..`-prefixed relative form so {@link isOutsideCwd} can flag them.
 *
 * @param target - The raw lint target path.
 * @param cwd - The working directory to relativize against.
 * @returns The normalized cwd-relative posix target.
 */
function normalizeTarget(target: string, cwd: string): string {
	let value = path.isAbsolute(target) ? toPosix(path.relative(cwd, target)) : toPosix(target);
	if (value.startsWith("./")) {
		value = value.slice(2);
	}

	while (value.endsWith("/")) {
		value = value.slice(0, -1);
	}

	return value;
}

/**
 * Whether a normalized target lies outside `cwd`. A cwd-relative listing never
 * starts with `..`, so any `..`-prefixed target can never match — its files are
 * invisible to the dirty count.
 *
 * @param normalizedTarget - A target already run through {@link normalizeTarget}.
 * @returns True when the target escapes `cwd`.
 */
function isOutsideCwd(normalizedTarget: string): boolean {
	return normalizedTarget === ".." || normalizedTarget.startsWith("../");
}

/**
 * Build a predicate for git-pathspec-style target membership: `.` matches
 * everything, otherwise a relative path matches when it equals a target or sits
 * beneath one. Faithful to `git ls-files -- <target>` for the plain directory
 * and file targets consumers pass.
 *
 * @param normalized - The lint target paths, already normalized against cwd.
 * @returns A predicate testing whether a relative posix path is a target.
 */
function matchTargets(normalized: Array<string>): (relative: string) => boolean {
	if (normalized.some((target) => target === "" || target === ".")) {
		return () => true;
	}

	return (relative) => {
		return normalized.some(
			(target) => relative === target || relative.startsWith(`${target}/`),
		);
	};
}

function isTypeAwareFile(filePath: string): boolean {
	return TYPE_AWARE_EXTENSION_SET.has(path.extname(filePath).toLowerCase());
}

function hasLintableExtension(filePath: string): boolean {
	return LINTABLE_EXTENSION_SET.has(path.extname(filePath).toLowerCase());
}

function gitListFiles(cwd: string, pathSpecs: Array<string>): Array<string> | undefined {
	try {
		const output = execFileSync(
			"git",
			["ls-files", "--cached", "--others", "--exclude-standard", "--", ...pathSpecs],
			{ cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
		);
		return output.split("\n").filter((line) => line.length > 0);
	} catch {
		return undefined;
	}
}

function walkDirectory(root: string, current: string, accumulator: Array<string>): void {
	let entries: Array<fs.Dirent>;
	try {
		entries = fs.readdirSync(current, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		const entryPath = path.join(current, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORED_WALK_DIRECTORIES.has(entry.name)) {
				walkDirectory(root, entryPath, accumulator);
			}

			continue;
		}

		if (entry.isFile()) {
			accumulator.push(toPosix(path.relative(root, entryPath)));
		}
	}
}

function walkFallback(cwd: string, targets: Array<string>): Array<string> {
	const files: Array<string> = [];
	for (const target of targets) {
		const absolute = path.resolve(cwd, target);
		let stat: fs.Stats;
		try {
			stat = fs.statSync(absolute);
		} catch {
			continue;
		}

		if (stat.isDirectory()) {
			walkDirectory(cwd, absolute, files);
		} else if (stat.isFile()) {
			files.push(toPosix(path.relative(cwd, absolute)));
		}
	}

	return files;
}

function listFiles(cwd: string, targets: Array<string>): Array<string> {
	return gitListFiles(cwd, targets) ?? walkFallback(cwd, targets);
}

function retained(files: Array<string>, ignored: ReadonlySet<string>): Array<string> {
	return files.filter((file) => !ignored.has(normalizePath(file)));
}
