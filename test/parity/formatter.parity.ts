/**
 * Formatter parity: `formatter: "standalone"` (ESLint lints, oxfmt formats)
 * must write the same bytes as `formatter: "eslint"` (oxfmt runs as an ESLint
 * rule). Each scenario runs the real tools over a scratch project in both
 * modes; the eslint-mode tree is the committed reference under
 * `fixtures/parity/output`.
 */

import path from "node:path";
import process from "node:process";
import { describe, it } from "vitest";
import type { ExpectStatic } from "vitest";

import { runMode } from "./harness.ts";
import type { ModeResult } from "./harness.ts";
import { changedFiles, PARITY_FIXTURES, serializeTree } from "./project.ts";
import type { Scenario } from "./project.ts";
import { scenarios } from "./scenarios.ts";

/** The prefix of every warning the preset prints. */
const PRESET_WARNING = "[@isentinel/eslint-config]";

function compareModes(
	scenario: Scenario,
	eslint: ModeResult,
	standalone: ModeResult,
	expect: ExpectStatic,
): void {
	expect(changedFiles(eslint.tree, standalone.tree)).toStrictEqual(
		scenario.knownDifference?.files ?? [],
	);
	if (!scenario.knownDifference) {
		expect(standalone.tree).toStrictEqual(eslint.tree);
	}

	expect(standalone.fatal).toStrictEqual(eslint.fatal);
	if (scenario.warns !== true) {
		expect(eslint.warnings).not.toContain(PRESET_WARNING);
		expect(standalone.warnings).not.toContain(PRESET_WARNING);
	}
}

async function checkScenario(scenario: Scenario, expect: ExpectStatic): Promise<void> {
	const [eslintRun, standaloneRun] = await Promise.allSettled([
		runMode(scenario, "eslint"),
		runMode(scenario, "standalone"),
	]);
	if (eslintRun.status === "rejected") {
		throw eslintRun.reason;
	}

	await expect
		.soft(serializeTree(eslintRun.value.tree))
		.toMatchFileSnapshot(path.join(PARITY_FIXTURES, "output", `${scenario.name}.txt`));

	if (standaloneRun.status === "rejected") {
		throw standaloneRun.reason;
	}

	compareModes(scenario, eslintRun.value, standaloneRun.value, expect);
	if (scenario.knownDifference) {
		await expect(serializeTree(standaloneRun.value.tree)).toMatchFileSnapshot(
			path.join(PARITY_FIXTURES, "output", `${scenario.name}.standalone.txt`),
		);
	}
}

/** `PARITY_SHARD`: the shard, then the shard count. */
const SHARD_PATTERN = /^(\d+)\/(\d+)$/;

/**
 * The scenarios this run owns. `PARITY_SHARD=i/n` (CI) takes every n-th
 * scenario from the i-th, after sorting the type-aware ones first, so each
 * shard gets its share of the slowest scenarios. Unset, the run takes all.
 *
 * @returns The scenarios to run, type-aware first.
 */
function shardScenarios(): Array<Scenario> {
	const sorted = scenarios.toSorted(
		(a, b) => Number(b.typeAware ?? false) - Number(a.typeAware ?? false),
	);
	const shard = process.env["PARITY_SHARD"];
	if (shard === undefined || shard === "") {
		return sorted;
	}

	const match = SHARD_PATTERN.exec(shard);
	const index = Number(match?.[1]);
	const count = Number(match?.[2]);
	if (match === null || index < 1 || index > count) {
		throw new Error(`PARITY_SHARD must be "i/n" with 1 <= i <= n, got "${shard}"`);
	}

	return sorted.filter((_, position) => position % count === index - 1);
}

const owned = shardScenarios();

// Type-aware scenarios build TypeScript programs; run in parallel with the
// rest they have crashed ESLint natively on Windows, so there they run one by
// one. Elsewhere they run with the rest, first, as they take the most rounds.
if (process.platform === "win32") {
	describe("formatter parity (type-aware)", () => {
		it.for(owned.filter(({ typeAware }) => typeAware === true))(
			"$name",
			async (scenario, { expect }) => checkScenario(scenario, expect),
		);
	});

	describe.concurrent("formatter parity", () => {
		it.for(owned.filter(({ typeAware }) => typeAware !== true))(
			"$name",
			async (scenario, { expect }) => checkScenario(scenario, expect),
		);
	});
} else {
	describe.concurrent("formatter parity", () => {
		it.for(owned)("$name", async (scenario, { expect }) => checkScenario(scenario, expect));
	});
}
