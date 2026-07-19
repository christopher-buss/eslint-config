// cspell:words lintable pathspec
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";

import { CACHE_BUST_PATTERNS, LINTABLE_EXTENSIONS, TYPE_AWARE_EXTENSIONS } from "./constants.ts";
import { toPosix } from "./paths.ts";

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
	/** Absolute paths of the lintable files within the lint targets. */
	lintable: Array<string>;
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
	const isWithinTargets = matchTargets(targets);

	const bustFiles: Array<string> = [];
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

	return { bustFiles, lintable, typeAware };
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

function normalizeTarget(target: string): string {
	let value = toPosix(target);
	if (value.startsWith("./")) {
		value = value.slice(2);
	}

	while (value.endsWith("/")) {
		value = value.slice(0, -1);
	}

	return value;
}

/**
 * Build a predicate for git-pathspec-style target membership: `.` matches
 * everything, otherwise a relative path matches when it equals a target or sits
 * beneath one. Faithful to `git ls-files -- <target>` for the plain directory
 * and file targets consumers pass.
 *
 * @param targets - The lint target paths.
 * @returns A predicate testing whether a relative posix path is a target.
 */
function matchTargets(targets: Array<string>): (relative: string) => boolean {
	const normalized = targets.map((target) => normalizeTarget(target));
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
