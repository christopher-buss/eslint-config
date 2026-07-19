import fs from "node:fs";
import path from "node:path";

/**
 * Markers that identify a repository or pnpm-workspace root. `.git` may be a
 * directory (normal clone) or a file (a worktree pointer); `existsSync` accepts
 * both.
 */
const WORKSPACE_ROOT_MARKERS = [".git", "pnpm-workspace.yaml"] as const;

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
