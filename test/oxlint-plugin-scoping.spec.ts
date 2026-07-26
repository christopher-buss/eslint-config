import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";

import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import type { OxlintConfig, OxlintOverride, RuleCategories } from "../src/oxlint/index.ts";
import { FIXTURES_TEMP } from "./helpers.ts";
import { runOxlint, OXLINT_TIMEOUT as timeout } from "./oxlint-run.ts";

/**
 * Every category at `error`, the setting that makes plugin scoping observable:
 * with the preset's all-`off` default no category rule fires, so a plugin
 * registered in the wrong place costs nothing.
 */
const ALL_CATEGORIES: RuleCategories = {
	correctness: "error",
	nursery: "error",
	pedantic: "error",
	perf: "error",
	restriction: "error",
	style: "error",
	suspicious: "error",
};

/**
 * Test-shaped source, so the vitest rules have something to bite on. Written to
 * a test file and to an ordinary source file alike — the only difference
 * between the two probes is where they sit.
 */
const PROBE = `describe("probe", () => {
	it.only("works", () => {
		expect(1).toBe(1);
	});
});
`;

const VITEST_FILES = ["bedrock/**/*.test.ts"];

/**
 * Lint two probes — one inside the vitest globs, one outside — against a
 * scoped config with every category on.
 *
 * @param name - A directory name for the run.
 * @returns The diagnostics from both probes.
 */
async function lintProbes(name: string): Promise<Array<string>> {
	const temporaryDirectory = path.resolve(FIXTURES_TEMP, name);
	await fs.mkdir(path.join(temporaryDirectory, "src"), { recursive: true });
	await fs.mkdir(path.join(temporaryDirectory, "bedrock"), { recursive: true });
	await fs.writeFile(path.join(temporaryDirectory, "src", "probe.ts"), PROBE);
	await fs.writeFile(path.join(temporaryDirectory, "bedrock", "probe.test.ts"), PROBE);

	const config = oxlintIsentinel({
		name: "test/oxlint-plugin-scoping",
		categories: ALL_CATEGORIES,
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		roblox: { files: ["src/**"] },
		spellCheck: false,
		test: { vitest: { files: VITEST_FILES } },
	});

	await fs.writeFile(
		path.join(temporaryDirectory, ".oxlintrc.json"),
		JSON.stringify(config, undefined, "\t"),
	);

	const diagnostics = runOxlint(temporaryDirectory);
	await fs.rm(temporaryDirectory, { force: true, recursive: true });
	return diagnostics;
}

/**
 * Lint one focused test with `vitest` registered at the given level and every
 * category on, to pin down where oxlint applies categories.
 *
 * @param name - A directory name for the run.
 * @param level - Where to register the plugin.
 * @returns The diagnostics.
 */
async function lintWithVitestAt(name: string, level: "override" | "top"): Promise<Array<string>> {
	const temporaryDirectory = path.resolve(FIXTURES_TEMP, name);
	await fs.mkdir(temporaryDirectory, { recursive: true });
	await fs.writeFile(path.join(temporaryDirectory, "probe.test.ts"), PROBE);

	const plugins = level === "top" ? ["eslint", "vitest"] : ["eslint"];
	const overrides = level === "top" ? [] : [{ files: ["**/*.ts"], plugins: ["vitest"] }];

	await fs.writeFile(
		path.join(temporaryDirectory, ".oxlintrc.json"),
		JSON.stringify({ categories: { correctness: "error" }, overrides, plugins }),
	);

	// An override-registered plugin is expected to contribute nothing here, so
	// an empty report is a result rather than a misconfiguration.
	const diagnostics = runOxlint(temporaryDirectory, true);
	await fs.rm(temporaryDirectory, { force: true, recursive: true });
	return diagnostics;
}

/**
 * The overrides that register a plugin themselves, rather than inheriting it
 * from the top level.
 *
 * @param config - The generated oxlint config.
 * @param plugin - The native plugin name to look for.
 * @returns The overrides carrying that plugin.
 */
function overridesRegistering(
	config: OxlintConfig,
	plugin: NonNullable<OxlintOverride["plugins"]>[number],
): Array<OxlintOverride> {
	const overrides = config.overrides ?? [];
	return overrides.filter((override) => {
		const plugins = override.plugins ?? [];
		return plugins.includes(plugin);
	});
}

describe("oxlint plugin scoping", () => {
	it(
		"should confine a file-scoped plugin's category rules to its globs",
		async ({ expect }) => {
			expect.assertions(2);

			const diagnostics = await lintProbes("oxlint-plugin-scoping");
			const vitest = diagnostics.filter((diagnostic) => diagnostic.includes(" vitest("));

			// Outside the vitest globs the plugin is not registered at all, so
			// no category can reach its rules.
			expect(vitest.filter((diagnostic) => diagnostic.startsWith("src/"))).toStrictEqual([]);

			// Inside them the preset's curated vitest rules still run. The probe
			// is the same source in both places, so this is the whole
			// difference the scoping makes.
			expect(vitest.some((diagnostic) => diagnostic.startsWith("bedrock/"))).toBe(true);
		},
		timeout,
	);

	// The scoping rests on this: if an oxlint upgrade started applying
	// categories to override-registered plugins too, every scoped plugin would
	// go back to firing wherever its override matches. Fail here rather than
	// let that land silently.
	it(
		"should apply categories to top-level plugins only",
		async ({ expect }) => {
			expect.assertions(2);

			const top = await lintWithVitestAt("oxlint-categories-top", "top");
			const override = await lintWithVitestAt("oxlint-categories-override", "override");

			expect(top.filter((diagnostic) => diagnostic.includes(" vitest("))).not.toStrictEqual(
				[],
			);
			expect(override.filter((diagnostic) => diagnostic.includes(" vitest("))).toStrictEqual(
				[],
			);
		},
		timeout,
	);

	it("should register scoped plugins on their override, not at the top level", ({ expect }) => {
		expect.assertions(3);

		const config = oxlintIsentinel({
			name: "test/oxlint-plugin-scoping",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			roblox: { files: ["src/**"] },
			test: { vitest: { files: VITEST_FILES } },
		});

		expect(config.plugins).not.toContain("vitest");
		// `node` covers the complement of the roblox globs; its rules cannot
		// fire inside them anyway (no `process` global), so the config is the
		// only place the scoping is observable.
		expect(config.plugins).not.toContain("node");
		expect(overridesRegistering(config, "vitest")).not.toStrictEqual([]);
	});
});
