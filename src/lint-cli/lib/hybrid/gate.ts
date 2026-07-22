// cspell:words mtimes unparseable

import { hybridStatusPath, readHybridStatus, writeHybridStatus } from "../../../hybrid-status.ts";
import type { HybridStatus } from "../../../hybrid-status.ts";
import { maxMtimeMs } from "../cache/entries.ts";
import type { RunContext } from "../context.ts";
import type { RepoFiles } from "../files/collect.ts";
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

/** Inputs to {@link resolveOxlintRun}, assembled once in the plan phase. */
export interface OxlintRunInput {
	/** The collected repo file lists (config-file subset + a probe target). */
	files: RepoFiles;
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
 * at least as new as the ESLint config; otherwise the resolved config is
 * actively probed (unless `mutate` is false, e.g. `--print`, which never probes
 * and assumes hybrid). A probe failure fails open: both engines run.
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
		// Could not determine the status (probe failed): fail open.
		return { reason: HYBRID_UNKNOWN_WARNING, run: true };
	}

	if (!status.oxlint) {
		return { reason: NON_HYBRID_WARNING, run: false };
	}

	return { reason: undefined, run: true };
}

/**
 * Read the cached hybrid status only when it is at least as new as the ESLint
 * config; a stale or missing file yields `undefined` (the caller then probes).
 *
 * Known limitation: freshness tracks `eslint.config.*` mtimes only, so toggling
 * hybrid mode from a module the config *imports* (rather than the config file
 * itself) is trusted from the cache for one more run before the factory's
 * passive write corrects it — it self-heals on the next invocation.
 *
 * @param cwd - The project root.
 * @param configMtime - The newest ESLint-config mtime, or `undefined` when none.
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
 * Resolve the hybrid status, trusting a fresh cache file and otherwise probing.
 * Returns `undefined` only when a probe was attempted and failed.
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
	const configMtime = maxMtimeMs(files.configFiles);

	const cached = readFreshHybridStatus(cwd, configMtime);
	if (cached !== undefined) {
		return cached;
	}

	if (!mutate) {
		// `--print` never probes (it would spawn a slow child) or writes; assume
		// hybrid so the both-engines composition prints unchanged.
		return { oxlint: true };
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
