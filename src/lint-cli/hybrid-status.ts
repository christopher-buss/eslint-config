import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * Directory (relative to the project root) where the CLI keeps its cache
 * artifacts. Lives under `node_modules/.cache` so it is discarded with the
 * dependency tree and never committed.
 */
const CACHE_DIRECTORY = path.join("node_modules", ".cache", "isentinel-lint");

/** File recording whether the resolved ESLint config runs in hybrid mode. */
const STATUS_FILE = "hybrid-status";

/**
 * The persisted hybrid status: whether the resolved ESLint config enabled the
 * factory's `oxlint` option (hybrid mode). Written passively by the factory on
 * every config evaluation and read by the CLI to decide whether running both
 * engines would duplicate work.
 */
export interface HybridStatus {
	/** Whether the ESLint config runs in hybrid (oxlint) mode. */
	oxlint: boolean;
}

/**
 * Absolute path to the hybrid-status file for a project root.
 *
 * @param cwd - The project root.
 * @returns The absolute status-file path.
 */
export function hybridStatusPath(cwd: string): string {
	return path.resolve(cwd, CACHE_DIRECTORY, STATUS_FILE);
}

/**
 * Passively record whether the resolved ESLint config runs in hybrid mode.
 * Called from the factory on every config evaluation, so it is write-if-changed
 * (read first, skip identical content) to avoid churning the file when editors
 * and both lint passes re-evaluate the config. Every failure is swallowed:
 * config evaluation must never throw for this, and the CLI treats a missing or
 * stale file as "unknown" and re-probes.
 *
 * Skipped entirely when `node_modules` is absent (nothing installed, so no
 * cache home and no CLI to read it).
 *
 * @param cwd - The project root.
 * @param oxlint - Whether the config enabled hybrid mode.
 */
export function writeHybridStatus(cwd: string, oxlint: boolean): void {
	try {
		if (!fs.existsSync(path.resolve(cwd, "node_modules"))) {
			return;
		}

		const filePath = hybridStatusPath(cwd);
		const content = `${JSON.stringify({ oxlint })}\n`;

		let existing: string | undefined;
		try {
			existing = fs.readFileSync(filePath, "utf8");
		} catch {
			existing = undefined;
		}

		if (existing === content) {
			// Content is unchanged, but refresh the mtime so the CLI freshness
			// check (status mtime >= config mtime) keeps passing after the config
			// is touched. Without this the mtime freezes at first write and every
			// later lint needlessly re-runs the ~3s probe. The passive factory
			// write thus keeps the status perpetually fresh.
			const now = Date.now() / 1000;
			fs.utimesSync(filePath, now, now);
			return;
		}

		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, content);
	} catch {
		// Best-effort: the CLI re-probes when the status is missing or
		// unreadable.
	}
}

/**
 * Read the persisted hybrid status, or `undefined` when the file is missing,
 * unreadable or malformed (the CLI then treats the status as unknown).
 *
 * @param cwd - The project root.
 * @returns The parsed status, or `undefined`.
 */
export function readHybridStatus(cwd: string): HybridStatus | undefined {
	let raw: string;
	try {
		raw = fs.readFileSync(hybridStatusPath(cwd), "utf8");
	} catch {
		return undefined;
	}

	try {
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			typeof (parsed as Record<string, unknown>)["oxlint"] === "boolean"
		) {
			return { oxlint: (parsed as HybridStatus).oxlint };
		}
	} catch {
		return undefined;
	}

	return undefined;
}

/**
 * Convenience wrapper defaulting the project root to `process.cwd()`, used by
 * the factory so the passive write stays a one-liner at the call site.
 *
 * @param oxlint - Whether the config enabled hybrid mode.
 */
export function writeHybridStatusForCwd(oxlint: boolean): void {
	writeHybridStatus(process.cwd(), oxlint);
}
