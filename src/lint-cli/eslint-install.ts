/**
 * Locating the ESLint installation a run's config is resolved against.
 *
 * The runner and its ignore helper both need it and must agree: the helper
 * serializes the config's match patterns out of one ESLint's config loader, and
 * the runner evaluates them with that same ESLint's matcher. Resolving them
 * separately would let the two drift onto different installations, and a
 * matcher that disagrees with the one that produced the patterns is exactly the
 * failure this feature cannot have.
 */
import { createRequire } from "node:module";
import path from "node:path";

/**
 * A synthetic basename for `createRequire`, which resolves relative to a file
 * rather than a directory. Spelled so it can never collide with a real consumer
 * module.
 */
const RESOLVE_ANCHOR = "__isentinel-lint__.js";

/** A resolved ESLint installation. */
export interface EslintInstall {
	/**
	 * A require anchored inside the package, for reaching its own files and its
	 * dependencies.
	 */
	requireFrom: NodeJS.Require;
	/** The package root. */
	root: string;
}

/**
 * Resolve the ESLint the consumer's config will be linted with: their own,
 * resolved from `cwd`, falling back to the one resolvable from this file (the
 * hoisted peer dependency) when `cwd` has no `node_modules` of its own — the
 * case in the fixture-based tests.
 *
 * @param cwd - The consumer project root.
 * @returns The package root and a require anchored in it.
 * @throws {Error} When ESLint cannot be resolved from either location.
 */
export function resolveEslintInstall(cwd: string): EslintInstall {
	let packageJson: string;
	try {
		packageJson = createRequire(path.join(cwd, RESOLVE_ANCHOR)).resolve("eslint/package.json");
	} catch {
		packageJson = createRequire(import.meta.url).resolve("eslint/package.json");
	}

	return { requireFrom: createRequire(packageJson), root: path.dirname(packageJson) };
}
