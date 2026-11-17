import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import { isRecord } from "./guards.ts";

/**
 * A synthetic basename for `createRequire`, which resolves relative to a file
 * rather than a directory. Spelled so it can never collide with a real consumer
 * module.
 */
export const RESOLVE_ANCHOR = "__isentinel-lint__.js";

/**
 * Locate a package's manifest exactly as a `require` call from `cwd` would.
 *
 * The walk is Node's own rather than a hand-rolled one: inside a worktree
 * nested in its own checkout the two disagree, and taking the ancestor's copy
 * silently picks a different version than every other tool sees.
 *
 * A package whose `exports` map hides `./package.json` still counts: Node
 * reports it as found but not exported, and the manifest is then read from the
 * first `node_modules` directory on Node's own lookup path that holds it.
 *
 * @param name - The package name to resolve.
 * @param cwd - The directory to resolve from.
 * @returns The absolute path to the package's `package.json`, or undefined when
 *   the package is not installed.
 */
export function resolvePackageManifest(name: string, cwd: string): string | undefined {
	const require = createRequire(path.join(cwd, RESOLVE_ANCHOR));
	try {
		return require.resolve(`${name}/package.json`);
	} catch (err) {
		if (!isRecord(err) || err["code"] !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
			return undefined;
		}
	}

	const lookupPaths = require.resolve.paths(name) ?? [];
	for (const directory of lookupPaths) {
		const manifest = path.join(directory, name, "package.json");
		if (fs.existsSync(manifest)) {
			return manifest;
		}
	}

	return undefined;
}

/**
 * Whether a package is installed where a `require` call from `cwd` would find
 * it. See {@link resolvePackageManifest}.
 *
 * @param name - The package name to look for.
 * @param cwd - The directory to resolve from. Defaults to the process cwd.
 * @returns Whether the package resolves.
 */
export function isPackageInstalled(name: string, cwd: string = process.cwd()): boolean {
	return resolvePackageManifest(name, cwd) !== undefined;
}
