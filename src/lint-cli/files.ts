// cspell:words lintable
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";

import { CACHE_BUST_PATTERNS, LINTABLE_EXTENSIONS, TYPE_AWARE_EXTENSIONS } from "./constants.ts";

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
 * Collect the absolute paths of lintable TS/JS files under `targets`,
 * honouring `.gitignore` (via `git ls-files`) when inside a git repository.
 *
 * @param cwd - The working directory to resolve targets against.
 * @param targets - The target paths to scan.
 * @returns The absolute paths of lintable files.
 */
export function collectLintableFiles(cwd: string, targets: Array<string>): Array<string> {
	return listFiles(cwd, targets)
		.filter(hasLintableExtension)
		.map((relative) => path.resolve(cwd, relative));
}

/**
 * Collect the absolute paths of every file whose modification busts the ESLint
 * cache (config files, tsconfigs, lockfiles). Always scans the whole project,
 * independent of the lint targets.
 *
 * @param cwd - The project root to scan.
 * @returns The absolute paths of cache-busting files.
 */
export function collectCacheBustFiles(cwd: string): Array<string> {
	const isMatch = picomatch([...CACHE_BUST_PATTERNS], { dot: true });
	return listFiles(cwd, ["."])
		.filter((relative) => isMatch(relative))
		.map((relative) => path.resolve(cwd, relative));
}

/**
 * Whether a file is a TS/JS-family file, meaning it is linted by the type-aware
 * (`--type-aware=only`) config. Used to size the typed pass from just the files
 * that can actually enter its cache.
 *
 * @param filePath - The file path to test.
 * @returns Whether the file is in the TS/JS family.
 */
export function isTypeAwareFile(filePath: string): boolean {
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

function toPosix(value: string): string {
	return value.split(path.sep).join("/");
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
