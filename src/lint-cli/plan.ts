// cspell:words lintable typeaware
import { availableParallelism } from "node:os";

import { applyHashBust, CONFIG_DRIFT, PACKAGE_RESOLUTION } from "./bust.ts";
import { maxMtimeMs, sweepStaleCaches } from "./cache.ts";
import { resolveWorkerLimits } from "./concurrency.ts";
import { computeConfigHash } from "./config-hash.ts";
import type { RunContext } from "./context.ts";
import { collectRepoFiles, oxlintTargets, withoutIgnored } from "./files.ts";
import { resolveOxlintRun } from "./hybrid.ts";
import { resolveIgnoredFiles } from "./ignored.ts";
import { computePackageJsonHash } from "./package-hash.ts";
import { selectPasses } from "./passes.ts";
import { resolveAgentsFormatter } from "./resolve.ts";
import type { PassPlan } from "./sizing.ts";
import { sizePasses } from "./sizing.ts";
import type { LintCliOptions } from "./types.ts";

/**
 * A composed run as plain data: all I/O and mutation happen once in
 * {@link plan} to build it, then `compose` turns it into child commands with no
 * further I/O.
 */
export interface RunPlan {
	/**
	 * Absolute path to the agent ESLint formatter (empty unless `--agents`).
	 */
	agentsFormatterPath: string;
	/** Whether the run is in CI. */
	ci: boolean;
	/** Whether the oxlint child runs. */
	oxlint: boolean;
	/** The paths the oxlint child receives (see `oxlintTargets`). */
	oxlintPaths: Array<string>;
	/**
	 * A stderr warning about the oxlint decision (non-hybrid config drop or an
	 * undeterminable hybrid status), or `undefined`.
	 */
	oxlintReason: string | undefined;
	/** Whether oxlint receives `--type-aware`. */
	oxlintTypeAware: boolean;
	/** The ESLint passes, in run order (empty for oxlint-only runs). */
	passes: Array<PassPlan>;
	/**
	 * Whether a lint target resolved outside the cwd, so the passes were sized
	 * conservatively and the typed-pass auto-skip was disabled. Emits a notice.
	 */
	targetsOutsideCwd: boolean;
}

/**
 * Plan the run: collect the repo file list once, apply the package.json and
 * mtime busts and TypeScript builder invalidation, size each pass and decide
 * which run. All I/O and mutation happen here, exactly once. When `mutate` is
 * false (`--print`) the whole mutation step is skipped — no builder, no cache
 * deletion, no state writes and no auto-skip — while still sizing from the
 * on-disk caches. The returned value is plain data.
 *
 * @param options - The parsed CLI options.
 * @param run - The run context (cwd, variant key, environment, mutate).
 * @returns The run plan.
 */
export function plan(options: LintCliOptions, run: RunContext): RunPlan {
	const { ci, cwd, environment, mutate } = run;
	const runEslint = !options.oxlint;
	const oxlintTypeAware = resolveOxlintTypeAware(options);
	const agentsFormatterPath = options.agents ? resolveAgentsFormatter() : "";

	// Targets oxlint cannot lint (a `package.json`-only commit, say) are dropped,
	// and oxlint is skipped outright when nothing survives — handed only such
	// paths it exits non-zero on "No files found to lint", failing a hook over a
	// file it was never going to lint. The default target `.` always survives.
	const oxlintPaths = oxlintTargets(cwd, options.paths);
	const runOxlint = !options.eslint && oxlintPaths.length > 0;

	if (!runEslint) {
		return {
			agentsFormatterPath,
			ci,
			oxlint: runOxlint,
			oxlintPaths,
			oxlintReason: undefined,
			oxlintTypeAware,
			passes: [],
			targetsOutsideCwd: false,
		};
	}

	const descriptors = selectPasses(options, ci);
	const files = collectRepoFiles(cwd, options.paths);
	const newestBustMtime = maxMtimeMs(files.bustFiles);
	const limits = resolveWorkerLimits(environment, availableParallelism());

	// Hybrid gate: when both engines would run, oxlint only runs if the resolved
	// ESLint config is hybrid (`oxlint: true`); otherwise the two engines would
	// double-lint every mapped rule. Decided here (before any child spawns) so
	// `--fix` never runs oxlint's fixes against a non-hybrid config.
	const oxlintDecision = resolveOxlintRun(run, { files, runEslint, runOxlint });

	// Evaluate every bust up front, before sizing any pass, then clear once. This
	// ordering is load-bearing: a per-pass staleness check that cleared caches
	// mid-loop could delete a cache an earlier pass was already sized against,
	// under-provisioning that pass's workers. Only meaningful with caching on;
	// `--no-cache` never touches cache state, and `--print` (mutate=false) never
	// mutates.
	//
	// The package.json bust runs first and deletes only this variant's type-aware
	// caches (a syntactic lint is immune to resolution changes), so it does NOT
	// feed `clearedCaches` — the fast cache survives it. The mtime sweep below is
	// the wholesale one, and it covers every variant on disk, not just the ones
	// this run selected.
	const canMutateCaches = mutate && options.cache;
	const hasTypeAwarePass = descriptors.some((descriptor) => descriptor.invalidation !== "none");

	// One hash per run, shared by the drift bust below and the ignore-set memo:
	// both answer "has the resolved config changed since last time", and the
	// closure walk is not worth doing twice. Only meaningful with caching on —
	// `--no-cache` counts every file dirty regardless.
	const configHash = options.cache ? computeConfigHash(cwd, files.configFiles) : undefined;

	if (canMutateCaches) {
		// Config drift through a module `eslint.config.*` imports shifts ESLint's
		// per-entry `hashOfConfig` (a full re-lint) but touches no bust file, so
		// the mtime dirty count would size `--concurrency off` for a serial full
		// re-lint. Content-hash the config's local import closure and delete all
		// three of this variant's caches when it changed. Applies to every pass
		// (a config change can alter a syntactic lint), so it runs before the
		// type-aware-only package.json bust.
		applyHashBust(run, CONFIG_DRIFT, configHash);
	}

	if (canMutateCaches && hasTypeAwarePass) {
		applyHashBust(run, PACKAGE_RESOLUTION, computePackageJsonHash(cwd));
	}

	const clearedCaches = new Set(canMutateCaches ? sweepStaleCaches(cwd, newestBustMtime) : []);

	// Drop the files ESLint declines to lint before anything sizes from them:
	// they never enter a cache, so they would otherwise read as dirty forever
	// and hold the typed pass's dirty count above zero (see
	// `resolveIgnoredFiles`).
	const ignored = resolveIgnoredFiles(run, configHash, files.lintable);
	const sizingFiles = withoutIgnored(files, ignored);

	const passes = sizePasses(descriptors, run, {
		clearedCaches,
		files: sizingFiles,
		limits,
		newestBustMtime,
		options,
	});

	return {
		agentsFormatterPath,
		ci,
		oxlint: oxlintDecision.run,
		oxlintPaths,
		oxlintReason: oxlintDecision.reason,
		oxlintTypeAware,
		passes,
		targetsOutsideCwd: files.targetsOutsideCwd,
	};
}

function resolveOxlintTypeAware(options: LintCliOptions): boolean {
	return !options.eslint && options.oxlintTypeAware && options.typeAware !== "off";
}
