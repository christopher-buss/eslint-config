// cspell:words typeaware unparseable buildinfo
import crypto from "node:crypto";
import path from "node:path";

import { isRecord } from "../../../guards.ts";
import { findWorkspaceRoot } from "../files/workspace.ts";
import { stableStringify } from "../stable-json.ts";
import { readFileIfPresent } from "../state.ts";

/**
 * `package.json` fields whose edits can change the types a consumer's importers
 * see (resolution surface + dependency versions). A change to any of these must
 * invalidate the type-aware caches; unrelated edits (`scripts`, `version`,
 * metadata) must not. `pnpm` (overrides/patchedDependencies) and
 * `optionalDependencies` can silently swap a resolved version too.
 */
export const RESOLUTION_FIELDS = [
	"exports",
	"imports",
	"main",
	"module",
	"types",
	"typesVersions",
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
	"pnpm",
] as const;

/**
 * {@link RESOLUTION_FIELDS} plus `type`, which decides every file's
 * `impliedFormat` and therefore how its imports resolve. The builder detects a
 * `type` flip through its own `impliedFormat` comparison, so the mtime/hash
 * bust never needed it; the buildinfo fast path has no such comparison and must
 * gate on it (see `computeResolutionGate`).
 */
export const MANIFEST_FIELDS = [...RESOLUTION_FIELDS, "type"] as const;

/**
 * Read a directory's `package.json` and project it down to the named fields, or
 * `undefined` when it is absent or unparseable.
 *
 * @param directory - The directory whose `package.json` to read.
 * @param fields - The manifest fields to keep.
 * @returns The field subset, or `undefined`.
 */
export function manifestSubset(
	directory: string,
	fields: ReadonlyArray<string>,
): Record<string, unknown> | undefined {
	const raw = readFileIfPresent(path.join(directory, "package.json"));
	if (raw === undefined) {
		return undefined;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}

	if (!isRecord(parsed)) {
		return undefined;
	}

	const subset: Record<string, unknown> = {};
	for (const field of fields) {
		if (Object.hasOwn(parsed, field)) {
			subset[field] = parsed[field];
		}
	}

	return subset;
}

/**
 * Hash the resolution-relevant fields of the consumer's `package.json` as
 * sorted, stable JSON. When `cwd` sits in a workspace whose root differs, the
 * root `package.json`'s resolution fields fold into the same digest — a hoisted
 * root dependency bump changes the types a sub-package sees even though its own
 * `package.json` text is untouched. Returns `undefined` when there is no
 * readable/parseable local `package.json` (the caller then treats the check as
 * a no-op).
 *
 * @param cwd - The consumer project root.
 * @returns The hex digest, or `undefined` when unavailable.
 */
export function computePackageJsonHash(cwd: string): string | undefined {
	const local = manifestSubset(cwd, RESOLUTION_FIELDS);
	if (local === undefined) {
		return undefined;
	}

	const combined: Record<string, unknown> = { local };
	const root = findWorkspaceRoot(cwd);
	if (root !== cwd) {
		const rootSubset = manifestSubset(root, RESOLUTION_FIELDS);
		if (rootSubset !== undefined) {
			combined["root"] = rootSubset;
		}
	}

	return crypto.createHash("sha256").update(stableStringify(combined)).digest("hex");
}
