// cspell:words mtimes unparseable
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { maxMtimeMs } from "./cache.ts";
import type { RepoFiles } from "./files.ts";
import { hybridStatusPath, readHybridStatus, writeHybridStatus } from "./hybrid-status.ts";
import type { HybridStatus } from "./hybrid-status.ts";
import { resolveLocalBin } from "./resolve.ts";

/** Matches the flat-config entry point (`eslint.config.js`, `.ts`, `.mjs`…). */
const ESLINT_CONFIG_FILE_PATTERN = /^eslint\.config\./;

/**
 * The stderr warning emitted when the resolved ESLint config is not hybrid, so
 * running oxlint too would double-lint every mapped rule. Oxlint is dropped.
 */
export const NON_HYBRID_WARNING =
	"isentinel-lint: the ESLint config does not enable hybrid mode (`oxlint: true`), " +
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
 * Probe the resolved ESLint config for the hybrid marker by spawning
 * `eslint --print-config <target>` and reading `settings["isentinel/oxlint"]`.
 * Returns `undefined` on any failure (missing bin, non-zero exit, malformed
 * output) so the caller can fail open.
 */
export type HybridProbe = (cwd: string, target: string) => HybridStatus | undefined;

/** Inputs to {@link resolveOxlintRun}, assembled once in the plan phase. */
export interface OxlintRunInput {
	/** The project root. */
	cwd: string;
	/** The collected repo file lists (config-file subset + a probe target). */
	files: RepoFiles;
	/**
	 * Whether the plan may mutate (false for `--print`: never probe or write).
	 */
	mutate: boolean;
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
 * Read the hybrid marker from `eslint --print-config` stdout. Config evaluation
 * can print non-JSON before the payload (plugin/editor-detection logs), so the
 * JSON object is isolated (first `{` to last `}`) before parsing. Returns
 * `undefined` when no JSON object is present or it fails to parse.
 *
 * @param stdout - The raw `--print-config` stdout.
 * @returns The probed status, or `undefined` when unparseable.
 */
export function parseHybridPrintConfig(stdout: string): HybridStatus | undefined {
	const first = stdout.indexOf("{");
	const last = stdout.lastIndexOf("}");
	if (first === -1 || last < first) {
		return undefined;
	}

	try {
		const config = JSON.parse(stdout.slice(first, last + 1)) as {
			settings?: Record<string, unknown>;
		};
		return { oxlint: config.settings?.["isentinel/oxlint"] === true };
	} catch {
		return undefined;
	}
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
 * @param input - The assembled plan-phase inputs.
 * @param probe - The config prober (injected in tests).
 * @returns The oxlint run decision.
 */
export function resolveOxlintRun(
	input: OxlintRunInput,
	probe: HybridProbe = probeHybridConfig,
): OxlintRunDecision {
	// Explicit single-tool selection: no check, no probe. `--eslint` leaves
	// `runOxlint` false (oxlint already off); `--oxlint` leaves `runEslint`
	// false (this branch never runs a hybrid check against it).
	if (!input.runOxlint || !input.runEslint) {
		return { reason: undefined, run: input.runOxlint };
	}

	const status = resolveHybridStatus(input, probe);
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
 * The ESLint-config subset of the cache-bust files: the files whose change
 * should invalidate the cached hybrid status. Lockfiles and tsconfigs are
 * excluded — only the ESLint config decides the `oxlint` option.
 *
 * @param bustFiles - The whole cache-bust file set.
 * @returns Every bust file whose basename is a flat-config entry point.
 */
function eslintConfigFiles(bustFiles: Array<string>): Array<string> {
	return bustFiles.filter((file) => ESLINT_CONFIG_FILE_PATTERN.test(path.basename(file)));
}

/**
 * Resolve the hybrid status, trusting a fresh cache file and otherwise probing.
 * Returns `undefined` only when a probe was attempted and failed.
 *
 * @param input - The assembled plan-phase inputs.
 * @param probe - The config prober.
 * @returns The hybrid status, or `undefined` when a probe failed.
 */
function resolveHybridStatus(
	{ cwd, files, mutate }: OxlintRunInput,
	probe: HybridProbe,
): HybridStatus | undefined {
	const configMtime = maxMtimeMs(eslintConfigFiles(files.bustFiles));

	const cached = readFreshHybridStatus(cwd, configMtime);
	if (cached !== undefined) {
		return cached;
	}

	if (!mutate) {
		// `--print` never probes (it would spawn a slow child) or writes; assume
		// hybrid so the both-engines composition prints unchanged.
		return { oxlint: true };
	}

	const target = files.typeAware[0] ?? eslintConfigFiles(files.bustFiles)[0];
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

/**
 * The real prober: spawn the resolved local ESLint with `--print-config` and
 * read the hybrid marker from the merged `settings`.
 *
 * @param cwd - The project root.
 * @param target - A file whose resolved config carries the marker.
 * @returns The probed status, or `undefined` on any failure.
 */
function probeHybridConfig(cwd: string, target: string): HybridStatus | undefined {
	let binJs: string;
	try {
		binJs = resolveLocalBin("eslint", cwd);
	} catch {
		return undefined;
	}

	const result = spawnSync(process.execPath, [binJs, "--print-config", target], {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});

	if (result.status !== 0 || typeof result.stdout !== "string") {
		return undefined;
	}

	return parseHybridPrintConfig(result.stdout);
}
