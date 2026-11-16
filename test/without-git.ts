import process from "node:process";

const GIT_KEYS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"];

/**
 * Run `run` with the git worktree environment variables unset so
 * `git ls-files` resolves against the temporary fixture directory rather than
 * the repository the tests themselves live in.
 *
 * A git hook sets these variables, so a test that runs inside one (a
 * pre-commit `vitest run`) would otherwise query the outer repository. When
 * `run` returns a promise, the variables stay unset until it settles: the
 * async work is what spawns git, after `run` itself has returned.
 *
 * @template T - The callback's return type.
 * @param run - The callback to run without git environment overrides.
 * @returns The callback's return value.
 */
export function withoutGitEnvironment<T>(run: () => T): T {
	const saved = GIT_KEYS.map((key): [string, string | undefined] => [key, process.env[key]]);
	for (const key of GIT_KEYS) {
		delete process.env[key];
	}

	let result: T;
	try {
		result = run();
	} catch (err) {
		restore(saved);
		throw err;
	}

	if (result instanceof Promise) {
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `result` is a promise of the same `T` the caller expects back.
		return result.finally(() => {
			restore(saved);
		}) as T;
	}

	restore(saved);
	return result;
}

function restore(saved: ReadonlyArray<[string, string | undefined]>): void {
	for (const [key, value] of saved) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}
