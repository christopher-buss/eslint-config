// cspell:words buildinfo mtimes relativised
import crypto from "node:crypto";
import path from "node:path";

import { MANIFEST_FIELDS, manifestSubset } from "../cache/package-hash.ts";
import { findWorkspaceMembers, findWorkspaceRoot } from "../files/workspace.ts";
import { stableStringify } from "../stable-json.ts";
import { readFileIfPresent } from "../state.ts";

/**
 * Lockfiles whose content pins which package version — and therefore which
 * `.d.ts` — every import resolves to. Hashed by content rather than mtime: a
 * reinstall rewrites mtimes without changing what resolves.
 */
const LOCKFILES = [
	"pnpm-lock.yaml",
	"package-lock.json",
	"yarn.lock",
	"bun.lock",
	"bun.lockb",
] as const;

/**
 * Digest everything outside the `.tsbuildinfo` that can change how a file's
 * imports resolve, for the buildinfo fast path to gate on.
 *
 * The builder notices these through its `referencedMap` comparison — a moved
 * `exports` target or a flipped `type` re-resolves an import, and the file's
 * referenced set changes even though its own text did not. The fast path only
 * compares source-text hashes and root membership, so it is structurally blind
 * to resolution drift and has to be told about it here instead.
 *
 * `computePackageJsonHash` is deliberately not reused: it covers only `cwd` and
 * the workspace root, omits `type`, and — more importantly — it is consumed by
 * a compare-and-swap the planner has already run by the time the builder is
 * asked for an affected set, so reading it here would always say "unchanged".
 *
 * Returns `undefined` when any input is undeterminable (no readable local
 * `package.json`, an unreadable workspace declaration, a member walk that
 * outgrew its budget). The caller must then take the builder path: a gate that
 * cannot see the whole resolution surface must not certify it as unchanged.
 *
 * @param cwd - The consumer project root.
 * @returns The hex digest, or `undefined` when it cannot be computed.
 */
export function computeResolutionGate(cwd: string): string | undefined {
	const local = manifestSubset(cwd, MANIFEST_FIELDS);
	if (local === undefined) {
		return undefined;
	}

	const root = findWorkspaceRoot(cwd);
	const members = findWorkspaceMembers(root);
	if (members === undefined) {
		return undefined;
	}

	const manifests: Record<string, unknown> = { ".": local };
	for (const directory of [root, ...members]) {
		// Keyed by the member's path relative to the root so the digest does not
		// move with the checkout, and sorted by `stableStringify` regardless of
		// the order the walk found them in.
		manifests[path.relative(root, directory) || "<root>"] = manifestSubset(
			directory,
			MANIFEST_FIELDS,
		);
	}

	const lockfiles: Record<string, unknown> = {};
	const lockfileDirectories = new Set([cwd, root]);
	for (const directory of lockfileDirectories) {
		for (const name of LOCKFILES) {
			const raw = readFileIfPresent(path.join(directory, name));
			if (raw !== undefined) {
				lockfiles[`${path.relative(root, directory)}/${name}`] = crypto
					.createHash("sha256")
					.update(raw)
					.digest("hex");
			}
		}
	}

	return crypto
		.createHash("sha256")
		.update(stableStringify({ lockfiles, manifests }))
		.digest("hex");
}

/**
 * Combine the run-wide resolution gate with one project's effective compiler
 * options into the value stored beside its buildinfo.
 *
 * The options belong here rather than in the buildinfo comparison because the
 * buildinfo's own `options` block is a filtered, path-relativised projection
 * (only `affectsBuildInfo` options survive, and paths are rewritten relative to
 * the buildinfo directory), so it cannot be compared against the options the
 * builder was handed.
 *
 * @param resolution - The run's resolution gate, or `undefined`.
 * @param options - The project's effective compiler options.
 * @returns The gate value, or `undefined` when the resolution gate is unknown.
 */
export function buildGateValue(
	resolution: string | undefined,
	options: Record<string, unknown>,
): string | undefined {
	if (resolution === undefined) {
		return undefined;
	}

	return crypto
		.createHash("sha256")
		.update(stableStringify({ options, resolution }))
		.digest("hex");
}
