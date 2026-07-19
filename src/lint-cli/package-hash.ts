// cspell:words typeaware
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CACHE_FILE_DEFAULT, CACHE_FILE_TYPE_AWARE } from "./constants.ts";

/**
 * Root `package.json` fields whose edits can change the types a consumer's
 * importers see (resolution surface + dependency versions). A change to any of
 * these must invalidate the type-aware caches; unrelated edits (`scripts`,
 * `version`, metadata) must not.
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
 * Hash the resolution-relevant fields of the root `package.json` as sorted,
 * stable JSON. Returns `undefined` when there is no readable/parseable
 * `package.json` (the caller then treats the check as a no-op).
 *
 * @param cwd - The consumer project root.
 * @returns The hex digest, or `undefined` when unavailable.
 */
export function computePackageJsonHash(cwd: string): string | undefined {
	let raw: string;
	try {
		raw = fs.readFileSync(path.join(cwd, "package.json"), "utf8");
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

	return crypto.createHash("sha256").update(stableStringify(subset)).digest("hex");
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
