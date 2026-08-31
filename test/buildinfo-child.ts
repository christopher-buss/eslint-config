// cspell:words buildinfo typeaware
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { resolveRunContext } from "../src/lint-cli/lib/context.ts";
import { computeAffectedFiles } from "../src/lint-cli/lib/typescript/affected.ts";

/**
 * Run one builder pass in a process of its own and write the answer to a file.
 *
 * The A/B fixtures compare the buildinfo fast path against the real builder,
 * and both drain state destructively — a shared process would let TypeScript's
 * own per-process caches make the second answer depend on the first, which is
 * exactly the independence the comparison is testing for.
 *
 * Usage: `node test/buildinfo-child.ts <cwd> <outFile>`.
 */
const [cwd = "", outFile = ""] = process.argv.slice(2);

const result = computeAffectedFiles(resolveRunContext(cwd, {}, true), undefined);

/**
 * Reduce one pass's answer to something a parent process can compare: the
 * affected paths as sorted, project-relative posix strings.
 *
 * @returns The serializable answer.
 */
/** The answer this child writes back to the parent test. */
interface BuildinfoPayload {
	affected?: Array<string>;
	firstRun?: boolean;
	skipped: boolean;
}

function toPayload(): BuildinfoPayload {
	if (result === undefined) {
		return { skipped: true };
	}

	const affected = Array.from(result.affected, (file) => {
		return path.relative(cwd, file).split(path.sep).join("/");
	});

	return { affected: affected.sort(), firstRun: result.firstRun, skipped: false };
}

fs.writeFileSync(outFile, JSON.stringify(toPayload()));
