import process from "node:process";

/**
 * Run `run` with the git worktree environment variables unset so
 * `git ls-files` resolves against the temporary fixture directory rather than
 * the repository the tests themselves live in.
 *
 * @template T - The callback's return type.
 * @param run - The callback to run without git environment overrides.
 * @returns The callback's return value.
 */
export function withoutGitEnvironment<T>(run: () => T): T {
	const keys = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"];
	const saved = keys.map((key): [string, string | undefined] => [key, process.env[key]]);
	for (const key of keys) {
		delete process.env[key];
	}

	try {
		return run();
	} finally {
		for (const [key, value] of saved) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}
