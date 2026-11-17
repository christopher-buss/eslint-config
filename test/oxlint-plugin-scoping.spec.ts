import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";

import { GLOB_SRC } from "../src/globs.ts";
import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import type {
	OxlintConfig,
	OxlintFactoryOptions,
	OxlintOverride,
	RuleCategories,
	TypedOxlintConfigItem,
} from "../src/oxlint/index.ts";
import { OXLINT_FIXTURES_TEMP, runOxlint, OXLINT_TIMEOUT as timeout } from "./oxlint-run.ts";

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
 * A consumer fragment that covers the whole tree and only turns `vitest` rules
 * off — the shape that used to register `vitest` everywhere.
 */
const WHOLE_TREE_VITEST_DISABLES: TypedOxlintConfigItem = {
	name: "project/native-strict-rules",
	files: [GLOB_SRC],
	rules: {
		"vitest/consistent-test-filename": "off",
		"vitest/require-hook": "off",
	},
};

/**
 * Build the scoped config the probes lint, with `vitest` confined to
 * {@link VITEST_FILES}.
 *
 * @param options - Extra factory options, such as `categories`.
 * @param userConfigs - Consumer fragments to merge after the preset.
 * @returns The generated oxlint config.
 */
function scopedConfig(
	options: Omit<OxlintFactoryOptions, "name"> = {},
	...userConfigs: Array<TypedOxlintConfigItem>
): OxlintConfig {
	return oxlintIsentinel(
		{
			name: "test/oxlint-plugin-scoping",
			...options,
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			roblox: { files: ["src/**"] },
			spellCheck: false,
			test: { vitest: { files: VITEST_FILES } },
		},
		...userConfigs,
	);
}

/**
 * Lint two probes — one inside the vitest globs, one outside — against a
 * scoped config with every category on.
 *
 * @param name - A directory name for the run.
 * @param userConfigs - Consumer fragments to merge after the preset.
 * @returns The diagnostics from both probes.
 */
async function lintProbes(
	name: string,
	...userConfigs: Array<TypedOxlintConfigItem>
): Promise<Array<string>> {
	const temporaryDirectory = path.resolve(OXLINT_FIXTURES_TEMP, name);
	await fs.mkdir(path.join(temporaryDirectory, "src"), { recursive: true });
	await fs.mkdir(path.join(temporaryDirectory, "bedrock"), { recursive: true });
	await fs.writeFile(path.join(temporaryDirectory, "src", "probe.ts"), PROBE);
	await fs.writeFile(path.join(temporaryDirectory, "bedrock", "probe.test.ts"), PROBE);

	const config = scopedConfig({ categories: ALL_CATEGORIES }, ...userConfigs);

	await fs.writeFile(
		path.join(temporaryDirectory, ".oxlintrc.json"),
		JSON.stringify(config, undefined, "\t"),
	);

	const diagnostics = runOxlint(temporaryDirectory);
	await fs.rm(temporaryDirectory, { force: true, recursive: true });
	return diagnostics;
}

/**
 * Lint one focused test with `vitest` registered at the given level and a
 * category on, to pin down where oxlint applies categories.
 *
 * The base set holds two plugins, as the preset's always does. With `eslint`
 * alone, oxlint 1.93 does not apply categories to an override-registered
 * plugin; any second base plugin makes it do so.
 *
 * @param name - A directory name for the run.
 * @param level - Where to register the plugin.
 * @returns The diagnostics.
 */
async function lintWithVitestAt(name: string, level: "override" | "top"): Promise<Array<string>> {
	const temporaryDirectory = path.resolve(OXLINT_FIXTURES_TEMP, name);
	await fs.mkdir(temporaryDirectory, { recursive: true });
	await fs.writeFile(path.join(temporaryDirectory, "probe.test.ts"), PROBE);

	const base = ["eslint", "import"];
	const plugins = level === "top" ? [...base, "vitest"] : base;
	const overrides = level === "top" ? [] : [{ files: ["**/*.ts"], plugins: ["vitest"] }];

	await fs.writeFile(
		path.join(temporaryDirectory, ".oxlintrc.json"),
		JSON.stringify({ categories: { correctness: "error" }, overrides, plugins }),
	);

	const diagnostics = runOxlint(temporaryDirectory);
	await fs.rm(temporaryDirectory, { force: true, recursive: true });
	return diagnostics;
}

/**
 * The overrides that register `vitest` themselves, rather than inheriting it
 * from the top level.
 *
 * @param config - The generated oxlint config.
 * @returns The overrides carrying `vitest`.
 */
function overridesRegisteringVitest(config: OxlintConfig): Array<OxlintOverride> {
	const overrides = config.overrides ?? [];
	return overrides.filter((override) => {
		const plugins = override.plugins ?? [];
		return plugins.includes("vitest");
	});
}

/**
 * The last override of a generated config: the consumer's fragment, when one
 * is passed.
 *
 * @param config - The generated oxlint config.
 * @returns The consumer's override, which the factory merges after the preset.
 * @throws {Error} When the config has no overrides.
 */
function lastOverride(config: OxlintConfig): OxlintOverride {
	const override = config.overrides?.at(-1);
	if (override === undefined) {
		throw new Error("The generated config has no overrides");
	}

	return override;
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

	it(
		"should keep a file-scoped plugin confined past a whole-tree override that only disables its rules",
		async ({ expect }) => {
			expect.assertions(2);

			const diagnostics = await lintProbes(
				"oxlint-plugin-scoping-disables",
				WHOLE_TREE_VITEST_DISABLES,
			);
			const vitest = diagnostics.filter((diagnostic) => diagnostic.includes(" vitest("));

			expect(vitest.filter((diagnostic) => diagnostic.startsWith("src/"))).toStrictEqual([]);
			expect(vitest.some((diagnostic) => diagnostic.startsWith("bedrock/"))).toBe(true);
		},
		timeout,
	);

	// Scoping a plugin confines it to the files its overrides match; it does
	// not keep categories out of those files. Every override that registers a
	// plugin hands its files every category-enabled rule the plugin owns, so
	// the registrations themselves have to stay narrow.
	it(
		"should apply categories to plugins an override registers",
		async ({ expect }) => {
			expect.assertions(2);

			const top = await lintWithVitestAt("oxlint-categories-top", "top");
			const override = await lintWithVitestAt("oxlint-categories-override", "override");

			expect(top.filter((diagnostic) => diagnostic.includes(" vitest("))).not.toStrictEqual(
				[],
			);
			expect(
				override.filter((diagnostic) => diagnostic.includes(" vitest(")),
			).not.toStrictEqual([]);
		},
		timeout,
	);

	it("should register scoped plugins on their override, not at the top level", ({ expect }) => {
		expect.assertions(3);

		const config = scopedConfig();

		expect(config.plugins).not.toContain("vitest");
		// `node` covers the complement of the roblox globs; its rules cannot
		// fire inside them anyway (no `process` global), so the config is the
		// only place the scoping is observable.
		expect(config.plugins).not.toContain("node");
		expect(overridesRegisteringVitest(config)).not.toStrictEqual([]);
	});

	it("should drop a whole-tree override's disables for a scoped plugin", ({ expect }) => {
		expect.assertions(2);

		const userOverride = lastOverride(scopedConfig({}, WHOLE_TREE_VITEST_DISABLES));

		// Registering the plugin to carry the disables would hand the whole
		// tree its category rules; without it they are inert.
		expect(userOverride.plugins).toBeUndefined();
		expect(userOverride.rules).toStrictEqual({});
	});

	it("should not register a scoped plugin at the top level for disables in `rules`", ({
		expect,
	}) => {
		expect.assertions(2);

		const config = scopedConfig({ rules: { "vitest/require-hook": "off" } });

		// `options.rules` covers the whole tree, so registering the plugin for
		// its disables would hoist it to the top level.
		expect(config.plugins).not.toContain("vitest");
		expect(
			overridesRegisteringVitest(config).flatMap((override) => override.files),
		).not.toContain(GLOB_SRC);
	});

	it("should keep an explicit plugin opt-in on a whole-tree override", ({ expect }) => {
		expect.assertions(2);

		const config = scopedConfig({}, { ...WHOLE_TREE_VITEST_DISABLES, plugins: ["vitest"] });

		// A hand-written `plugins` entry opts the plugin into categories
		// project-wide, so it stays global and its disables stay with it.
		expect(config.plugins).toContain("vitest");
		expect(lastOverride(config).rules).toStrictEqual(WHOLE_TREE_VITEST_DISABLES.rules);
	});

	it("should keep a narrow override's disables for a scoped plugin", ({ expect }) => {
		expect.assertions(2);

		const userOverride = lastOverride(
			scopedConfig(
				{},
				{
					...WHOLE_TREE_VITEST_DISABLES,
					files: ["bedrock/legacy/**/*.test.ts"],
				},
			),
		);

		// A narrow disable is a relaxation where the plugin is enabled, and it
		// only applies while the override carries the plugin.
		expect(userOverride.plugins).toStrictEqual(["vitest"]);
		expect(userOverride.rules).toStrictEqual(WHOLE_TREE_VITEST_DISABLES.rules);
	});

	it("should keep a whole-tree override's disables when it also enables the plugin's rules", ({
		expect,
	}) => {
		expect.assertions(2);

		const rules = {
			...WHOLE_TREE_VITEST_DISABLES.rules,
			"vitest/no-focused-tests": "error",
		} as const;
		const userOverride = lastOverride(
			scopedConfig({}, { ...WHOLE_TREE_VITEST_DISABLES, rules }),
		);

		// The override asks for the plugin across the whole tree, so the
		// registration is what the consumer wrote rather than a leak.
		expect(userOverride.plugins).toStrictEqual(["vitest"]);
		expect(userOverride.rules).toStrictEqual(rules);
	});
});
