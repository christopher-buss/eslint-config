// cspell:words mtimes unparseable

import { hybridStatusPath, readHybridStatus, writeHybridStatus } from "../../../hybrid-status.ts";
import type { HybridStatus } from "../../../hybrid-status.ts";
import { configClosureFiles } from "../cache/config-hash.ts";
import { maxMtimeMs } from "../cache/entries.ts";
import type { RunContext } from "../context.ts";
import type { RepositoryFiles } from "../files/collect.ts";
import type { HybridProbe } from "./probe.ts";
import { probeHybridConfig } from "./probe.ts";

/**
 * The stderr warning emitted when the resolved ESLint config is not hybrid, so
 * running oxlint too would double-lint every mapped rule. Oxlint is dropped.
 */
export const NON_HYBRID_WARNING =
	"isentinel-lint: the ESLint config does not enable hybrid mode (`oxlint: true` " +
	'or `oxlint: "native"`), ' +
	"so oxlint would re-run rules ESLint already checks. Running ESLint only; enable " +
	"hybrid mode in your config or pass --oxlint to run oxlint explicitly.\n";

/**
 * The stderr warning emitted when the hybrid status cannot be determined (the
 * probe failed). The run fails open: both engines run, as before.
 */
export const HYBRID_UNKNOWN_WARNING =
	"isentinel-lint: could not determine whether the ESLint config enables hybrid " +
	"mode; running both engines.\n";

/**
 * The stderr notice emitted by `--print` when no current hybrid status is
 * cached. `--print` never probes, so the oxlint child it lists is a guess: a
 * real run probes and may drop it.
 */
export const HYBRID_UNVERIFIED_NOTICE =
	"isentinel-lint: --print did not check whether the ESLint config enables hybrid " +
	"mode (no current status is cached), so it lists oxlint; a real run may drop it.\n";

/** Inputs to {@link resolveOxlintRun}, assembled once in the plan phase. */
export interface OxlintRunInput {
	/** The collected repo file lists (config-file subset + a probe target). */
	files: RepositoryFiles;
	/** Whether ESLint would run (false for `--oxlint`). */
	runEslint: boolean;
	/** Whether oxlint would run (false for `--eslint`). */
	runOxlint: boolean;
}

/** The oxlint run decision produced in the plan phase. */
export interface OxlintRunDecision {
	/** A stderr warning to emit, or `undefined`. */
	reason: string | undefined;
	/** Whether the oxlint child runs. */
	run: boolean;
}

/**
 * Decide whether the oxlint child runs. When both engines would run (default
 * mode or `--fix`, i.e. Neither `--eslint` nor `--oxlint`), the ESLint config
 * must be hybrid or oxlint would double-lint every mapped rule; a non-hybrid
 * config drops oxlint with a warning. Explicit single-tool runs skip the check
 * entirely and keep today's behaviour.
 *
 * The hybrid status is trusted from the on-disk `hybrid-status` file when it is
 * at least as new as the ESLint config and its local imports; otherwise the
 * resolved config is actively probed (unless `mutate` is false, e.g. `--print`,
 * which never probes). A failed or skipped probe fails open: both engines run,
 * with a notice.
 *
 * @param run - The run context.
 * @param input - The assembled plan-phase inputs.
 * @param probe - The config prober (injected in tests).
 * @returns The oxlint run decision.
 */
export function resolveOxlintRun(
	run: RunContext,
	input: OxlintRunInput,
	probe: HybridProbe = probeHybridConfig,
): OxlintRunDecision {
	// Explicit single-tool selection: no check, no probe. `--eslint` leaves
	// `runOxlint` false (oxlint already off); `--oxlint` leaves `runEslint`
	// false (this branch never runs a hybrid check against it).
	if (!input.runOxlint || !input.runEslint) {
		return { reason: undefined, run: input.runOxlint };
	}

	const status = resolveHybridStatus(run, input, probe);
	if (status === undefined) {
		// Could not determine the status (probe failed or skipped): fail open.
		return {
			reason: run.mutate ? HYBRID_UNKNOWN_WARNING : HYBRID_UNVERIFIED_NOTICE,
			run: true,
		};
	}

	if (!status.oxlint) {
		return { reason: NON_HYBRID_WARNING, run: false };
	}

	return { reason: undefined, run: true };
}

/**
 * Read the cached hybrid status only when it is at least as new as the ESLint
 * config and every local module it imports; a stale or missing file yields
 * `undefined` (the caller then probes). Imports count because hybrid mode can
 * be toggled from a module the config imports, which leaves the config file
 * itself untouched.
 *
 * @param cwd - The project root.
 * @param configMtime - The newest mtime across the config import closure, or
 *   `undefined` when there is no config.
 * @returns The fresh cached status, or `undefined`.
 */
function readFreshHybridStatus(
	cwd: string,
	configMtime: number | undefined,
): HybridStatus | undefined {
	const status = readHybridStatus(cwd);
	if (status === undefined) {
		return undefined;
	}

	if (configMtime === undefined) {
		return status;
	}

	const statusMtime = maxMtimeMs([hybridStatusPath(cwd)]);
	if (statusMtime === undefined || statusMtime < configMtime) {
		return undefined;
	}

	return status;
}

/**
 * Resolve the hybrid status, trusting a fresh cache file (only when the config
 * import closure was found in full) and otherwise probing. Returns `undefined`
 * when a probe failed, or when a read-only (`--print`) run skipped it.
 *
 * @param run - The run context.
 * @param input - The assembled plan-phase inputs.
 * @param probe - The config prober.
 * @returns The hybrid status, or `undefined` when a probe failed.
 */
function resolveHybridStatus(
	{ cwd, mutate }: RunContext,
	{ files }: OxlintRunInput,
	probe: HybridProbe,
): HybridStatus | undefined {
	const closure = configClosureFiles(cwd, files.configFiles);

	// A partial closure cannot show that no import changed, so its cache is
	// never trusted. The cost is a probe on every run, only where `typescript`
	// is missing or the config imports more modules than the walk's cap.
	if (closure.complete) {
		const cached = readFreshHybridStatus(cwd, maxMtimeMs(closure.files));
		if (cached !== undefined) {
			return cached;
		}
	}

	if (!mutate) {
		// `--print` never probes (it would spawn a slow child) or writes. The
		// caller fails open and says the oxlint child is unverified.
		return undefined;
	}

	const target = files.typeAware[0] ?? files.configFiles[0];
	if (target === undefined) {
		return undefined;
	}

	const probed = probe(cwd, target);
	if (probed === undefined) {
		return undefined;
	}

	// The probe pays once per config change: persist so later runs read it back.
	writeHybridStatus(cwd, probed.oxlint);
	return probed;
}
