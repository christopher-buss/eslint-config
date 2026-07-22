// cspell:words unparseable
import { spawnSync } from "node:child_process";
import process from "node:process";

import { isRecord } from "../../../guards.ts";
import type { HybridStatus } from "../../../hybrid-status.ts";
import { resolveLocalBin } from "../exec/resolve.ts";

/**
 * Probe the resolved ESLint config for the hybrid marker by spawning
 * `eslint --print-config <target>` and reading `settings["isentinel/oxlint"]`.
 * Returns `undefined` on any failure (missing bin, non-zero exit, malformed
 * output) so the caller can fail open.
 */
export type HybridProbe = (cwd: string, target: string) => HybridStatus | undefined;

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
		const config: unknown = JSON.parse(stdout.slice(first, last + 1));
		const settings = isRecord(config) ? config["settings"] : undefined;
		return { oxlint: isRecord(settings) && settings["isentinel/oxlint"] === true };
	} catch {
		return undefined;
	}
}

/**
 * The real prober: spawn the resolved local ESLint with `--print-config` and
 * read the hybrid marker from the merged `settings`.
 *
 * @param cwd - The project root.
 * @param target - A file whose resolved config carries the marker.
 * @returns The probed status, or `undefined` on any failure.
 */
export function probeHybridConfig(cwd: string, target: string): HybridStatus | undefined {
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
