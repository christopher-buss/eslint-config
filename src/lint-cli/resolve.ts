import { getPackageInfoSync } from "local-pkg";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CliError } from "./types.ts";

/** Memoised {@link resolveLocalBin} results, keyed by `cwd\0name`. */
const localBinCache = new Map<string, string>();

/**
 * Resolve the JavaScript entry of a locally installed CLI (eslint / oxlint)
 * from the consumer's `node_modules`, walking up from `cwd`. Returning the JS
 * file lets the caller spawn it with `process.execPath` and no shell, avoiding
 * Windows `.cmd`/`.ps1` quoting hazards. Memoised so the two ESLint passes
 * resolve the same bin once.
 *
 * @param name - The package name to resolve (for example `eslint`).
 * @param cwd - The directory to resolve from.
 * @returns The absolute path to the package's JavaScript entry.
 */
export function resolveLocalBin(name: string, cwd: string): string {
	const cacheKey = `${cwd}\0${name}`;
	const cached = localBinCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	const info = getPackageInfoSync(name, { paths: [cwd] });
	if (info === undefined) {
		throw new CliError(
			`Could not find "${name}". Install it in this project to run isentinel-lint.`,
		);
	}

	const { bin } = info.packageJson;
	const relative = typeof bin === "string" ? bin : bin?.[name];
	if (relative === undefined) {
		throw new CliError(`Package "${name}" does not declare a "${name}" bin entry.`);
	}

	const resolved = path.resolve(info.rootPath, relative);
	localBinCache.set(cacheKey, resolved);
	return resolved;
}

/**
 * Resolve the agent-friendly ESLint formatter shipped alongside this entry.
 *
 * TODO(agents-formatter): the `formatter-agents.mjs` module is ported by a
 * separate change. This resolves its expected dist location lazily so builds
 * succeed before it lands; it is only ever called when `--agents` is used.
 *
 * @returns The absolute path to the agent ESLint formatter.
 */
export function resolveAgentsFormatter(): string {
	return fileURLToPath(new URL("./formatter-agents.mjs", import.meta.url));
}
