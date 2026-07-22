import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { readState, statePath, touchState, writeState } from "./lint-cli/lib/state.ts";

/**
 * The persisted hybrid status: whether the resolved ESLint config enabled the
 * factory's `oxlint` option (hybrid mode). Written passively by the factory on
 * every config evaluation and read by the CLI to decide whether running both
 * engines would duplicate work.
 *
 * Lives here rather than under `src/lint-cli/` because it is genuinely shared:
 * the factory writes it during config evaluation and the lint runner reads it.
 * Routing the factory's import through the runner would pull that whole tree
 * (yargs, concurrently) into `dist/index.mjs`; the state primitives it does
 * import use node builtins only.
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
	return statePath(cwd, "hybrid-status");
}

/**
 * Read the persisted hybrid status, or `undefined` when the file is missing,
 * unreadable or malformed (the CLI then treats the status as unknown).
 *
 * @param cwd - The project root.
 * @returns The parsed status, or `undefined`.
 */
export function readHybridStatus(cwd: string): HybridStatus | undefined {
	const stored = readState<HybridStatus>(hybridStatusPath(cwd));
	return typeof stored?.oxlint === "boolean" ? stored : undefined;
}

/**
 * Passively record whether the resolved ESLint config runs in hybrid mode.
 * Called from the factory on every config evaluation, so an unchanged status is
 * touched rather than rewritten: the file must not churn as editors and both
 * lint passes re-evaluate the config, yet its mtime must stay ahead of the
 * config's or the CLI re-runs its ~3s probe every lint. Every failure is
 * swallowed — config evaluation must never throw for this, and the CLI treats a
 * missing or stale file as "unknown" and re-probes.
 *
 * Skipped entirely when `node_modules` is absent (nothing installed, so no
 * cache home and no CLI to read it).
 *
 * @param cwd - The project root.
 * @param oxlint - Whether the config enabled hybrid mode.
 */
export function writeHybridStatus(cwd: string, oxlint: boolean): void {
	let installed: boolean;
	try {
		installed = fs.existsSync(path.resolve(cwd, "node_modules"));
	} catch {
		return;
	}

	if (!installed) {
		return;
	}

	const filePath = hybridStatusPath(cwd);
	if (readHybridStatus(cwd)?.oxlint === oxlint) {
		touchState(filePath);
		return;
	}

	writeState(filePath, { oxlint } satisfies HybridStatus);
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
