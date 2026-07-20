// cspell:words typeaware unparseable
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CACHE_FILE_DEFAULT, CACHE_FILE_TYPE_AWARE } from "./constants.ts";
import { findWorkspaceRoot } from "./workspace.ts";

/**
 * Root `package.json` fields whose edits can change the types a consumer's
 * importers see (resolution surface + dependency versions). A change to any of
 * these must invalidate the type-aware caches; unrelated edits (`scripts`,
 * `version`, metadata) must not. `pnpm` (overrides/patchedDependencies) and
 * `optionalDependencies` can silently swap a resolved version too.
 */
const RESOLUTION_FIELDS = [
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

/** Outcome of the package.json resolution-hash check. */
export interface PackageJsonBustOutcome {
	/** True when the hash changed and the type-aware caches were deleted. */
	busted: boolean;
	/** True when no prior hash existed (state stored, no bust). */
	firstRun: boolean;
}

/**
 * Resolve the persisted package.json resolution-hash file. Stored alongside the
 * builder state so it is cleaned with `node_modules`.
 *
 * @param cwd - The consumer project root.
 * @returns The absolute path to the stored-hash file.
 */
export function packageHashStatePath(cwd: string): string {
	return path.join(cwd, "node_modules", ".cache", "isentinel-lint", "package-json-hash");
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
	const local = resolutionSubset(cwd);
	if (local === undefined) {
		return undefined;
	}

	const combined: Record<string, unknown> = { local };
	const root = findWorkspaceRoot(cwd);
	if (root !== cwd) {
		const rootSubset = resolutionSubset(root);
		if (rootSubset !== undefined) {
			combined["root"] = rootSubset;
		}
	}

	return crypto.createHash("sha256").update(stableStringify(combined)).digest("hex");
}

/**
 * Bust the type-aware caches when the root `package.json` resolution surface
 * changed since the last run. Deletes `.eslintcache-typeaware` and
 * `.eslintcache` (both type-aware configs) while leaving `.eslintcache-fast`
 * (syntactic-only) intact, since resolution changes cannot alter a syntactic
 * lint. The first run only stores the hash.
 *
 * @param cwd - The consumer project root.
 * @returns The bust outcome.
 */
export function applyPackageJsonBust(cwd: string): PackageJsonBustOutcome {
	const hash = computePackageJsonHash(cwd);
	if (hash === undefined) {
		return { busted: false, firstRun: false };
	}

	const statePath = packageHashStatePath(cwd);
	const stored = safeRead(statePath);
	if (stored === hash) {
		return { busted: false, firstRun: false };
	}

	writeHash(statePath, hash);
	if (stored === undefined) {
		return { busted: false, firstRun: true };
	}

	fs.rmSync(path.resolve(cwd, CACHE_FILE_TYPE_AWARE), { force: true });
	fs.rmSync(path.resolve(cwd, CACHE_FILE_DEFAULT), { force: true });
	return { busted: true, firstRun: false };
}

/**
 * Read a directory's `package.json` and project it down to the resolution
 * fields, or `undefined` when it is absent or unparseable.
 *
 * @param directory - The directory whose `package.json` to read.
 * @returns The resolution-field subset, or `undefined`.
 */
function resolutionSubset(directory: string): Record<string, unknown> | undefined {
	let raw: string;
	try {
		raw = fs.readFileSync(path.join(directory, "package.json"), "utf8");
	} catch {
		return undefined;
	}

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return undefined;
	}

	const subset: Record<string, unknown> = {};
	for (const field of RESOLUTION_FIELDS) {
		if (Object.hasOwn(parsed, field)) {
			subset[field] = parsed[field];
		}
	}

	return subset;
}

/**
 * Serialize a value to JSON with object keys sorted at every depth so the
 * digest is insensitive to key ordering.
 *
 * @param value - The value to stringify.
 * @returns The stable JSON string.
 */
function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}

	if (value !== null && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const entries = Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
		return `{${entries.join(",")}}`;
	}

	return JSON.stringify(value);
}

function safeRead(filePath: string): string | undefined {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}
}

function writeHash(statePath: string, hash: string): void {
	fs.mkdirSync(path.dirname(statePath), { recursive: true });
	fs.writeFileSync(statePath, hash);
}
