import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const GIT_DIRECTORY_PREFIX = "gitdir:";
const LINE_BREAK_PATTERN = /\r?\n/;

export interface GitExclude {
	/** Absolute path of `info/exclude`, which may not exist. */
	file: string;
	/** Whether the closest `.git` is a file (linked worktree or submodule). */
	linked: boolean;
}

/**
 * Finds the `info/exclude` file git applies to `cwd`.
 *
 * In a linked worktree or a submodule, `.git` is a file with a `gitdir:` line.
 * A worktree's git directory also holds a `commondir` file that names the
 * shared git directory, which owns `info/exclude`.
 *
 * @param cwd - Directory to start the search from.
 * @returns The exclude file, or `undefined` outside a repository.
 */
export function findGitExclude(cwd: string): GitExclude | undefined {
	const dotGit = findClosestDotGit(cwd);
	if (dotGit === undefined) {
		return undefined;
	}

	if (statSync(dotGit).isDirectory()) {
		return { file: path.join(dotGit, "info", "exclude"), linked: false };
	}

	const line = readFileSync(dotGit, "utf8")
		.split(LINE_BREAK_PATTERN)
		.find((entry) => entry.startsWith(GIT_DIRECTORY_PREFIX));
	if (line === undefined) {
		return undefined;
	}

	const target = line.slice(GIT_DIRECTORY_PREFIX.length).trim();
	const gitDirectory = path.resolve(path.dirname(dotGit), target);
	return {
		file: path.join(resolveCommonDirectory(gitDirectory), "info", "exclude"),
		linked: true,
	};
}

function findClosestDotGit(cwd: string): string | undefined {
	let directory = path.resolve(cwd);
	while (true) {
		const candidate = path.join(directory, ".git");
		if (existsSync(candidate)) {
			return candidate;
		}

		const parent = path.dirname(directory);
		if (parent === directory) {
			return undefined;
		}

		directory = parent;
	}
}

function resolveCommonDirectory(gitDirectory: string): string {
	try {
		const commonDirectory = readFileSync(path.join(gitDirectory, "commondir"), "utf8").trim();
		return path.resolve(gitDirectory, commonDirectory);
	} catch {
		return gitDirectory;
	}
}
