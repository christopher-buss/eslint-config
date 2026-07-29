// cspell:words lintable typeaware
import { availableParallelism } from "node:os";

import { applyHashBust, CONFIG_DRIFT, PACKAGE_RESOLUTION } from "../cache/bust.ts";
import { computeConfigHash } from "../cache/config-hash.ts";
import { maxMtimeMs, sweepStaleCaches } from "../cache/entries.ts";
import { computePackageJsonHash } from "../cache/package-hash.ts";
import type { LintCliOptions } from "../cli/types.ts";
import type { RunContext } from "../context.ts";
import { resolveAgentsFormatter } from "../exec/resolve.ts";
import { collectRepoFiles, oxlintTargets, withoutIgnored } from "../files/collect.ts";
import { resolveIgnoredFiles } from "../files/ignored.ts";
import { resolveOxlintRun } from "../hybrid/gate.ts";
import { resolveWorkerLimits } from "./concurrency.ts";
import type { PassDescriptor } from "./passes.ts";
import { selectPasses } from "./passes.ts";
import type { PassPlan, SizingInputs } from "./sizing.ts";
import { sizePasses } from "./sizing.ts";

/**
 * A composed run as plain data: the I/O and mutation behind it happen in
 * {@link plan}, then `compose` turns it into child commands with no further
 * I/O. A staged run leaves one step outstanding — see {@link StagedPlan} — but
 * this value is complete for the passes it carries.
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
 * A run planned in two stages, so the children that need nothing from the
 * TypeScript builder stop waiting behind it.
 *
 * Sizing a type-aware pass means running the incremental builder over the whole
 * program — seconds on a real project, and unconditional even when it reports
 * nothing affected. Everything else the planner does is cheap. Splitting the
 * plan lets the oxlint child and the syntactic pass spawn first and lint while
 * the builder runs, with the type-aware child joining once its own sizing is
 * known.
 */
export interface StagedPlan {
	/** The part of the run that is ready to spawn now. */
	eager: RunPlan;
	/**
	 * Size the passes held back from {@link StagedPlan.eager}: runs the
	 * TypeScript builder and folds its invalidation into the type-aware cache.
	 * `undefined` when nothing was held back, which is also the whole plan for
	 * `--print` and `--fix`.
	 *
	 * Call once, and only after the eager children have spawned — it mutates
	 * the type-aware cache the child it plans is about to read.
	 */
	resolveDeferred: (() => Array<PassPlan>) | undefined;
}

/** What the staging decision needs to know beyond the descriptors. */
interface StagingInputs {
	/** Whether the run selected more than one pass. */
	multiPass: boolean;
	/** Whether an oxlint child survived the hybrid gate. */
	oxlint: boolean;
	/** Whether a lint target resolved outside the cwd. */
	targetsOutsideCwd: boolean;
}

/** How the selected passes split across the two spawn stages. */
interface StagedDescriptors {
	/** Passes whose dirty count needs the builder; sized after the spawn. */
	deferred: Array<PassDescriptor>;
	/** Passes sized now, so their children spawn before the builder runs. */
	eager: Array<PassDescriptor>;
}

/**
 * Plan the run: collect the repo file list once, apply the package.json and
 * mtime busts, size each pass and decide which run. Every cache bust and every
 * deletion happens here, before anything spawns, so no child ever lints against
 * a cache that is about to vanish. When `mutate` is false (`--print`) the whole
 * mutation step is skipped — no builder, no cache deletion, no state writes and
 * no auto-skip — while still sizing from the on-disk caches.
 *
 * The one step that may outlive this call is the TypeScript builder behind a
 * type-aware pass's dirty count; see {@link StagedPlan}. The returned eager
 * half is plain data.
 *
 * @param options - The parsed CLI options.
 * @param run - The run context (cwd, variant key, environment, mutate).
 * @returns The staged run plan.
 */
export function plan(options: LintCliOptions, run: RunContext): StagedPlan {
	const { ci, cwd, environment, mutate } = run;
	const runEslint = !options.oxlint;
	const oxlintTypeAware = resolveOxlintTypeAware(options);
	const agentsFormatterPath = options.agents ? resolveAgentsFormatter() : "";

	// Targets oxlint cannot lint (a `package.json`-only commit, say) are dropped,
	// and oxlint is skipped outright when nothing survives, so no child spawns
	// for a run with nothing to do. Surviving targets that oxlint's own config
	// ignores are not predictable here; `--no-error-on-unmatched-pattern` (see
	// `composeOxlintCommand`) is what keeps those from failing the run. The
	// default target `.` always survives.
	const oxlintPaths = oxlintTargets(cwd, options.paths);
	const runOxlint = !options.eslint && oxlintPaths.length > 0;

	if (!runEslint) {
		return {
			eager: {
				agentsFormatterPath,
				ci,
				oxlint: runOxlint,
				oxlintPaths,
				oxlintReason: undefined,
				oxlintTypeAware,
				passes: [],
				targetsOutsideCwd: false,
			},
			resolveDeferred: undefined,
		};
	}

	const descriptors = selectPasses(options, ci);
	const files = collectRepoFiles(cwd, options.paths);
	const newestBustMtime = maxMtimeMs(files.bustFiles);
	const limits = resolveWorkerLimits(environment, availableParallelism(), ci);

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

	const inputs: SizingInputs = {
		clearedCaches,
		files: sizingFiles,
		limits,
		multiPass: descriptors.length > 1,
		newestBustMtime,
		options,
	};

	const staged = stageDescriptors(descriptors, options, run, {
		multiPass: inputs.multiPass,
		oxlint: oxlintDecision.run,
		targetsOutsideCwd: sizingFiles.targetsOutsideCwd,
	});

	return {
		eager: {
			agentsFormatterPath,
			ci,
			oxlint: oxlintDecision.run,
			oxlintPaths,
			oxlintReason: oxlintDecision.reason,
			oxlintTypeAware,
			passes: sizePasses(staged.eager, run, inputs),
			targetsOutsideCwd: files.targetsOutsideCwd,
		},
		resolveDeferred:
			staged.deferred.length > 0 ? () => sizePasses(staged.deferred, run, inputs) : undefined,
	};
}

function resolveOxlintTypeAware(options: LintCliOptions): boolean {
	return !options.eslint && options.oxlintTypeAware && options.typeAware !== "off";
}

/**
 * Split the selected passes into the ones that can be sized now and the ones
 * worth holding back until their siblings are already linting. Only a pass that
 * runs the TypeScript builder is ever held back — that is the whole cost being
 * moved off the critical path.
 *
 * Everything else stays eager, and four cases opt out of staging entirely:
 *
 * - `--print` (`mutate` false) runs no builder anyway and must stay one pure
 *   snapshot printed in a single go;
 * - `--fix` runs its children one at a time, so a later spawn buys nothing and
 *   there is no reason to reopen the write race the sequential path prevents;
 * - a run with no eager child at all, where holding the builder-backed pass
 *   back would only delay the whole run;
 * - a run whose one eager child could end up alone, because the type-aware pass
 *   it was staged alongside auto-skipped. A lone child gets inherited stdio
 *   (colour, no prefix), and staging would have already committed it to the
 *   prefixed, piped harness for no gain.
 *
 * @param descriptors - The selected passes, in run order.
 * @param options - The parsed CLI options.
 * @param run - The run context.
 * @param staging - The oxlint decision and the auto-skip inputs.
 * @returns The two stages, each in run order.
 */
function stageDescriptors(
	descriptors: Array<PassDescriptor>,
	options: LintCliOptions,
	run: RunContext,
	staging: StagingInputs,
): StagedDescriptors {
	const eager = descriptors.filter((descriptor) => descriptor.invalidation === "none");
	const deferred = descriptors.filter((descriptor) => descriptor.invalidation !== "none");
	const unstaged: StagedDescriptors = { deferred: [], eager: descriptors };

	if (!run.mutate || options.fix || deferred.length === 0) {
		return unstaged;
	}

	const eagerChildren = (staging.oxlint ? 1 : 0) + eager.length;
	const mayAutoSkip = staging.multiPass && !staging.targetsOutsideCwd;
	if (eagerChildren === 0 || (eagerChildren === 1 && mayAutoSkip)) {
		return unstaged;
	}

	return { deferred, eager };
}
