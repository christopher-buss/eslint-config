import { execFileSync } from "node:child_process";
import process from "node:process";
import { describe, it } from "vitest";

import type { JsonValue } from "../src/guards.ts";
import { isRecord } from "../src/guards.ts";
import { isentinel } from "../src/index.ts";
import type { TypedFlatConfigItem } from "../src/index.ts";
import {
	isOxlintCovered,
	isentinel as oxlintIsentinel,
	oxlintRuleMapping,
	translateRuleToOxlint,
} from "../src/oxlint/index.ts";
import type { OxlintConfig } from "../src/oxlint/index.ts";
import { redactMachinePaths } from "./helpers.ts";
import {
	effectiveEslintRules,
	enabledEslintRules,
	enabledFromEffective,
	enabledOxlintRules,
	formatterDisabledRules,
} from "./oxlint-helpers.ts";
import { oxlintBinary } from "./oxlint-run.ts";
import { snapshotFixtures } from "./snapshot-fixtures.ts";
import type { FactoryOptions } from "./snapshot-fixtures.ts";

interface OxlintRuleInfo {
	scope: string;
	type_aware: boolean;
	value: string;
}

interface HybridVariant {
	name: string;
	eslintOptions: FactoryOptions;
	oxlintOptions: FactoryOptions;
}

/**
 * Whether a parsed value has the shape of an oxlint native rule entry.
 *
 * @param value - A candidate element from the parsed rule list.
 * @returns Whether the value matches {@link OxlintRuleInfo}.
 */
function isOxlintRuleInfo(value: unknown): value is OxlintRuleInfo {
	return (
		isRecord(value) &&
		typeof value["scope"] === "string" &&
		typeof value["value"] === "string" &&
		typeof value["type_aware"] === "boolean"
	);
}

/**
 * Query the installed oxlint binary for its native rule list.
 *
 * @returns Native rule metadata keyed by `scope/rule`.
 */
function getOxlintNativeRules(): Map<string, OxlintRuleInfo> {
	const output = execFileSync(oxlintBinary(), ["--rules", "-f", "json"], {
		encoding: "utf8",
		shell: process.platform === "win32",
	});

	const rules = new Map<string, OxlintRuleInfo>();
	const parsed: unknown = JSON.parse(output);
	const ruleList = Array.isArray(parsed) ? parsed : [];
	for (const rule of ruleList) {
		if (isOxlintRuleInfo(rule)) {
			// `--rules` reports scopes with underscores (`react_perf`);
			// config keys use the hyphenated name (`react-perf`).
			rules.set(`${rule.scope.replaceAll("_", "-")}/${rule.value}`, rule);
		}
	}

	return rules;
}

/**
 * Check one non-jsPlugin mapping entry against oxlint's native rule list.
 *
 * @param rule - The canonical ESLint rule name.
 * @param target - Where the mapping says the rule runs.
 * @param nativeRules - Native rule metadata keyed by `scope/rule`.
 * @returns The problems found, empty when the mapping is correct.
 */
function nativeMappingProblems(
	rule: string,
	target: string,
	nativeRules: Map<string, OxlintRuleInfo>,
): Array<string> {
	const translated = translateRuleToOxlint(rule);
	const lookup = translated.includes("/") ? translated : `eslint/${translated}`;
	const info = nativeRules.get(lookup);

	if (info === undefined) {
		return [`${rule} -> ${translated} does not exist in oxlint`];
	}

	if (target === "tsgolint" && !info.type_aware) {
		return [`${rule} is mapped to tsgolint but is not type-aware`];
	}

	if (target === "native" && info.type_aware) {
		return [`${rule} is mapped to native but requires type information`];
	}

	return [];
}

/**
 * Whether an override turns off `oxc/no-barrel-file` for declaration files.
 *
 * @param override - The oxlint config override to inspect.
 * @returns Whether the override disables the rule for `.d.ts` files.
 */
function disablesBarrelFileForDts(
	override: NonNullable<OxlintConfig["overrides"]>[number],
): boolean {
	return (
		override.files.some((glob) => glob.includes(".d.")) &&
		override.rules?.["oxc/no-barrel-file"] === "off"
	);
}

/**
 * Collect every override glob (files and excludeFiles) from a config.
 *
 * @param config - The oxlint config to inspect.
 * @returns Every glob referenced by an override.
 */
function collectOverrideGlobs(config: OxlintConfig): Array<string> {
	const globs: Array<string> = [];
	const overrides = config.overrides ?? [];
	for (const override of overrides) {
		globs.push(...override.files, ...(override.excludeFiles ?? []));
	}

	return globs;
}

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
} as const;

const variants: Array<HybridVariant> = [
	{
		name: "roblox-game",
		eslintOptions: { ...baseOptions },
		oxlintOptions: { ...baseOptions },
	},
	{
		name: "roblox-react",
		eslintOptions: { ...baseOptions, react: true },
		oxlintOptions: { ...baseOptions, react: true },
	},
	{
		name: "roblox-jest",
		eslintOptions: { ...baseOptions, test: { jest: true } },
		oxlintOptions: { ...baseOptions, test: { jest: true } },
	},
	{
		name: "package-vitest",
		eslintOptions: {
			...baseOptions,
			roblox: false,
			test: { vitest: true },
			type: "package",
		},
		oxlintOptions: {
			...baseOptions,
			roblox: false,
			test: { vitest: true },
			type: "package",
		},
	},
	{
		name: "package",
		eslintOptions: {
			...baseOptions,
			eslintPlugin: true,
			roblox: false,
			type: "package",
			typescript: { erasableOnly: true },
		},
		oxlintOptions: {
			...baseOptions,
			eslintPlugin: true,
			roblox: false,
			type: "package",
			typescript: { erasableOnly: true },
		},
	},
];

describe("oxlint hybrid coverage", () => {
	describe.for(variants)("$name", (variant: HybridVariant) => {
		it("should keep every dropped rule enabled in the oxlint config", async ({ expect }) => {
			expect.assertions(5);

			const eslintOnly = await isentinel({
				name: "test/eslint-only",
				...variant.eslintOptions,
			});
			const hybrid = await isentinel({
				name: "test/hybrid",
				...variant.eslintOptions,
				oxlint: true,
			});

			const enabledBefore = enabledEslintRules([...eslintOnly]);
			const enabledAfter = enabledEslintRules([...hybrid]);
			// Rules the oxfmt layer disables are enabled by a rule module and
			// switched off again before anything runs them, so hybrid mode
			// moving them is not a coverage question — they are off in both
			// engines either way.
			const formatterDisabled = formatterDisabledRules([...eslintOnly]);
			const dropped = [...enabledBefore]
				.filter((rule) => !enabledAfter.has(rule))
				.filter((rule) => !formatterDisabled.has(rule));

			// Hybrid mode must actually move rules to oxlint
			expect(dropped.length).toBeGreaterThan(100);

			// Every dropped rule must be part of the explicit mapping
			const unmapped = dropped.filter((rule) => !isOxlintCovered(rule));

			expect(unmapped).toStrictEqual([]);

			// ... and enabled in the oxlint factory output
			const oxlintConfig = oxlintIsentinel({
				name: "test/oxlint",
				...variant.oxlintOptions,
			});
			const oxlintEnabled = enabledOxlintRules(oxlintConfig);
			const missing = dropped.filter(
				(rule) => !oxlintEnabled.has(translateRuleToOxlint(rule)),
			);

			expect(missing).toStrictEqual([]);

			// Oxlint cannot lint Markdown code blocks, so hybrid mode must
			// keep the ESLint-only effective rule set for Markdown-virtual
			// files (the synthesized markdown-code siblings provide this).
			const markdownPath = "docs/guide.md/0_0.ts";
			const markdownBefore = enabledFromEffective(
				effectiveEslintRules([...eslintOnly], markdownPath),
			);
			const markdownAfter = enabledFromEffective(
				effectiveEslintRules([...hybrid], markdownPath),
			);
			const lostInMarkdown = [...markdownBefore].filter((rule) => !markdownAfter.has(rule));
			const gainedInMarkdown = [...markdownAfter].filter((rule) => !markdownBefore.has(rule));

			expect(lostInMarkdown).toStrictEqual([]);
			expect(gainedInMarkdown).toStrictEqual([]);
		});
	});

	it("should only map to native and type-aware rules that exist in oxlint", ({ expect }) => {
		expect.assertions(1);

		const nativeRules = getOxlintNativeRules();
		const problems = Object.entries(oxlintRuleMapping)
			.filter(([, target]) => target !== "js-plugin")
			.flatMap(([rule, target]) => nativeMappingProblems(rule, target, nativeRules));

		expect(problems).toStrictEqual([]);
	});
});

/**
 * Whether any resolved config carries the hybrid marker the lint CLI probes
 * for.
 *
 * @param configs - The resolved flat config items.
 * @returns Whether `settings["isentinel/oxlint"]` is stamped anywhere.
 */
function hasOxlintMarker(configs: Array<TypedFlatConfigItem>): boolean {
	return configs.some((config) => config.settings?.["isentinel/oxlint"] === true);
}

describe("hybrid marker", () => {
	it("stamps the oxlint marker only when hybrid mode is enabled", async ({ expect }) => {
		expect.assertions(2);

		const hybrid = await isentinel({
			name: "test/marker-hybrid",
			...baseOptions,
			oxlint: true,
		});
		const plain = await isentinel({ name: "test/marker-plain", ...baseOptions });

		expect(hasOxlintMarker([...hybrid])).toBe(true);
		expect(hasOxlintMarker([...plain])).toBe(false);
	});
});

describe("oxlint config snapshots", () => {
	describe.for(snapshotFixtures)("$name", ({ name, options }) => {
		it("should match the config snapshot", ({ expect }) => {
			expect.assertions(1);

			const config = oxlintIsentinel({ name: `test/oxlint-${name}`, ...options });

			expect(serializeOxlintConfig(config)).toMatchSnapshot();
		});
	});

	it("should anchor slash-less override globs to the config root", ({ expect }) => {
		expect.assertions(1);

		// Oxlint matches a slash-less override glob gitignore-style at any
		// depth, so an unanchored root glob such as `*` would apply a root-only
		// relaxation to the whole tree (#617). ESLint anchors these to the
		// config root; a leading `./` makes oxlint do the same.
		const config = oxlintIsentinel({
			name: "test/oxlint-anchored-globs",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
		});

		const unanchored = collectOverrideGlobs(config).filter((glob) => !glob.includes("/"));

		expect(unanchored).toEqual([]);
	});
});

const ALL_CATEGORIES_OFF = {
	correctness: "off",
	nursery: "off",
	pedantic: "off",
	perf: "off",
	restriction: "off",
	style: "off",
	suspicious: "off",
};

describe("oxlint categories", () => {
	it("should disable every category by default", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({ name: "test/oxlint-categories-default" });

		expect(config.categories).toStrictEqual(ALL_CATEGORIES_OFF);
	});

	it("should merge a user category over the defaults", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({
			name: "test/oxlint-categories-merge",
			categories: { nursery: "warn" },
		});

		expect(config.categories).toStrictEqual({ ...ALL_CATEGORIES_OFF, nursery: "warn" });
	});

	it("should let a user value win over a default of the same key", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({
			name: "test/oxlint-categories-override",
			categories: { correctness: "error" },
		});

		expect(config.categories).toStrictEqual({ ...ALL_CATEGORIES_OFF, correctness: "error" });
	});
});

const OXC_GLOBAL_RULES = [
	"oxc/approx-constant",
	"oxc/bad-array-method-on-arguments",
	"oxc/bad-char-at-comparison",
	"oxc/bad-comparison-sequence",
	"oxc/bad-min-max-func",
	"oxc/bad-object-literal-comparison",
	"oxc/bad-replace-all-arg",
	"oxc/branches-sharing-code",
	"oxc/const-comparisons",
	"oxc/double-comparisons",
	"oxc/erasing-op",
	"oxc/misrefactored-assign-op",
	"oxc/missing-throw",
	"oxc/no-accumulating-spread",
	"oxc/no-barrel-file",
	"oxc/no-map-spread",
	"oxc/no-this-in-exported-function",
	"oxc/number-arg-out-of-range",
	"oxc/only-used-in-recursion",
	"oxc/uninvoked-array-callback",
];

const OXC_NON_ROBLOX_RULES = ["oxc/bad-bitwise-operator", "oxc/no-const-enum"];

/**
 * Collect the enabled `oxc/*` rules from a generated oxlint config, sorted.
 *
 * @param config - The generated oxlint config.
 * @returns The enabled oxc rule names.
 */
function enabledOxcRules(config: OxlintConfig): Array<string> {
	return [...enabledOxlintRules(config)].filter((rule) => rule.startsWith("oxc/")).toSorted();
}

describe("oxc rules", () => {
	it("should enable the global oxc set for a roblox game config", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({ name: "test/oxc-game", ...baseOptions });

		expect(enabledOxcRules(config)).toStrictEqual(OXC_GLOBAL_RULES.toSorted());
	});

	it("should add the non-roblox oxc rules for a package config", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({
			...baseOptions,
			name: "test/oxc-package",
			roblox: false,
			type: "package",
		});

		expect(enabledOxcRules(config)).toStrictEqual(
			[...OXC_GLOBAL_RULES, ...OXC_NON_ROBLOX_RULES].toSorted(),
		);
	});

	it("should register the oxc native plugin when enabled", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({ name: "test/oxc-plugin", ...baseOptions });

		expect(config.plugins).toContain("oxc");
	});

	it("should omit every oxc rule when oxc is disabled", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({ ...baseOptions, name: "test/oxc-off", oxc: false });

		expect(enabledOxcRules(config)).toStrictEqual([]);
	});

	it("should route a user oxc rule override to the native side", ({ expect }) => {
		expect.assertions(3);

		function build(): OxlintConfig {
			return oxlintIsentinel({
				...baseOptions,
				name: "test/oxc-user-override",
				rules: { "oxc/no-const-enum": "error" },
			});
		}

		expect(build).not.toThrow();

		const config = build();
		const emitted = config.overrides!.some(
			(override) => override.rules!["oxc/no-const-enum"] === "error",
		);

		expect(config.plugins).toContain("oxc");
		expect(emitted).toBe(true);
	});

	it("should disable oxc/no-barrel-file for declaration files", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({ name: "test/oxc-dts", ...baseOptions });

		const disabled = config.overrides!.some(disablesBarrelFileForDts);

		expect(disabled).toBe(true);
	});

	it("should preserve a user oxc rule disable", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({
			...baseOptions,
			name: "test/oxc-user-disable",
			rules: { "oxc/no-barrel-file": "off" },
		});

		const disabled = config.overrides!.some(
			(override) => override.rules!["oxc/no-barrel-file"] === "off",
		);

		expect(disabled).toBe(true);
	});

	it("should treat rules covered by a native oxc rule as oxlint-covered", ({ expect }) => {
		expect.assertions(4);

		expect(isOxlintCovered("sonar/no-all-duplicated-branches")).toBe(true);
		expect(isOxlintCovered("unicorn/no-accidental-bitwise-operator")).toBe(true);
		expect(translateRuleToOxlint("sonar/no-all-duplicated-branches")).toBe(
			"oxc/branches-sharing-code",
		);
		expect(translateRuleToOxlint("unicorn/no-accidental-bitwise-operator")).toBe(
			"oxc/bad-bitwise-operator",
		);
	});

	it("should drop an oxc-covered rule from ESLint in hybrid mode but keep it otherwise", async ({
		expect,
	}) => {
		expect.assertions(2);

		const options = { ...baseOptions, roblox: false, type: "package" } as const;
		const eslintOnly = await isentinel({ name: "test/oxc-cover-eslint", ...options });
		const hybrid = await isentinel({ name: "test/oxc-cover-hybrid", ...options, oxlint: true });

		const before = enabledEslintRules([...eslintOnly]);
		const after = enabledEslintRules([...hybrid]);

		// Enabled in ESLint-only (oxlint does not run), dropped in hybrid (the
		// native oxc/branches-sharing-code rule covers it on the oxlint side).
		expect(before.has("sonar/no-all-duplicated-branches")).toBe(true);
		expect(after.has("sonar/no-all-duplicated-branches")).toBe(false);
	});
});

const REACT_PERFORMANCE_RULES = [
	"react-perf/jsx-no-jsx-as-prop",
	"react-perf/jsx-no-new-array-as-prop",
	"react-perf/jsx-no-new-function-as-prop",
	"react-perf/jsx-no-new-object-as-prop",
] as const;

type ReactPerformanceEntry = NonNullable<
	NonNullable<OxlintConfig["rules"]>["react-perf/jsx-no-jsx-as-prop"]
>;

/**
 * Collect the enabled `react-perf/*` rules from a generated oxlint config,
 * sorted.
 *
 * @param config - The generated oxlint config.
 * @returns The enabled react-perf rule names.
 */
function enabledReactPerformanceRules(config: OxlintConfig): Array<string> {
	return [...enabledOxlintRules(config)]
		.filter((rule) => rule.startsWith("react-perf/"))
		.toSorted();
}

/**
 * Collect every `react-perf/*` rule entry the config emits, from the top level
 * and from overrides.
 *
 * @param config - The generated oxlint config.
 * @returns The emitted rule entries.
 */
function reactPerformanceEntries(config: OxlintConfig): Array<ReactPerformanceEntry> {
	const ruleMaps = [config.rules, ...(config.overrides ?? []).map((override) => override.rules)];

	const entries: Array<ReactPerformanceEntry> = [];
	for (const ruleMap of ruleMaps) {
		for (const rule of REACT_PERFORMANCE_RULES) {
			const entry = ruleMap?.[rule];
			if (entry !== undefined) {
				entries.push(entry);
			}
		}
	}

	return entries;
}

/**
 * The severity of a rule entry, with any options stripped.
 *
 * @param entry - An emitted rule entry, bare or with options.
 * @returns The bare severity of that entry.
 */
function entrySeverity(entry: ReactPerformanceEntry): ReactPerformanceEntry {
	return Array.isArray(entry) ? entry[0] : entry;
}

describe("react-perf rules", () => {
	const reactOptions = { ...baseOptions, react: true } as const;

	it("should omit the react-perf rules when react is disabled", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({ name: "test/react-perf-off", ...baseOptions });

		expect(enabledReactPerformanceRules(config)).toStrictEqual([]);
	});

	it("should enable every react-perf rule as an error when react is enabled", ({ expect }) => {
		expect.assertions(2);

		const config = oxlintIsentinel({ ...reactOptions, name: "test/react-perf-on" });
		const severities = reactPerformanceEntries(config).map(entrySeverity);

		expect(enabledReactPerformanceRules(config)).toStrictEqual(
			REACT_PERFORMANCE_RULES.toSorted(),
		);
		expect(severities).toStrictEqual(["error", "error", "error", "error"]);
	});

	it("should allow native elements under roblox", ({ expect }) => {
		expect.assertions(2);

		const config = oxlintIsentinel({ ...reactOptions, name: "test/react-perf-roblox" });
		const entries = reactPerformanceEntries(config);

		expect(entries).toHaveLength(4);
		expect(entries).toStrictEqual(
			Array.from({ length: 4 }, () => ["error", { nativeAllowList: "all" }]),
		);
	});

	it("should not allow native elements when roblox is disabled", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({
			...reactOptions,
			name: "test/react-perf-no-roblox",
			roblox: false,
			type: "package",
		});

		expect(reactPerformanceEntries(config)).toStrictEqual(["error", "error", "error", "error"]);
	});

	it("should register the react-perf plugin at the top level", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({ ...reactOptions, name: "test/react-perf-plugin" });

		expect(config.plugins).toContain("react-perf");
	});

	it("should keep the react-perf rules in native-only mode", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({
			...reactOptions,
			name: "test/react-perf-native-only",
			jsPlugins: false,
		});

		expect(enabledReactPerformanceRules(config)).toStrictEqual(
			REACT_PERFORMANCE_RULES.toSorted(),
		);
	});
});

describe("scoped roblox complement", () => {
	function nodeOverrides(config: OxlintConfig): NonNullable<OxlintConfig["overrides"]> {
		return (config.overrides ?? []).filter((override) => {
			return Object.keys(override.rules ?? {}).some((rule) => rule.startsWith("node/"));
		});
	}

	it("applies node rules to the complement with the roblox scope excluded", ({ expect }) => {
		expect.assertions(2);

		const config = oxlintIsentinel({
			name: "test/scoped-roblox",
			gitignore: false,
			roblox: { files: ["src/**"] },
			spellCheck: false,
		});

		const overrides = nodeOverrides(config);

		expect(overrides.length).toBeGreaterThan(0);

		expect(overrides.map((override) => override.excludeFiles)).toStrictEqual(
			overrides.map(() => ["src/**"]),
		);
	});

	function floatingPromiseOverrides(
		config: OxlintConfig,
	): NonNullable<OxlintConfig["overrides"]> {
		return (config.overrides ?? []).filter((override) => {
			return override.rules?.["typescript/no-floating-promises"] !== undefined;
		});
	}

	it("turns off checkThenables for the complement only", ({ expect }) => {
		expect.assertions(4);

		const config = oxlintIsentinel({
			name: "test/scoped-roblox",
			gitignore: false,
			roblox: { files: ["src/**"] },
			spellCheck: false,
		});

		const overrides = floatingPromiseOverrides(config);

		expect(overrides).toHaveLength(2);
		expect(overrides[0]).not.toHaveProperty("excludeFiles");
		expect(overrides[0]).toMatchObject({
			rules: {
				"typescript/no-floating-promises": [
					"error",
					{ checkThenables: true, ignoreVoid: true },
				],
			},
		});
		expect(overrides[1]).toMatchObject({
			excludeFiles: ["src/**"],
			rules: {
				"typescript/no-floating-promises": [
					"error",
					{ checkThenables: false, ignoreVoid: true },
				],
			},
		});
	});

	it("adds no node rules to the default roblox config", ({ expect }) => {
		expect.assertions(1);

		const config = oxlintIsentinel({
			name: "test/default-roblox",
			gitignore: false,
			spellCheck: false,
		});

		expect(nodeOverrides(config)).toHaveLength(0);
	});
});

/**
 * Serialize an oxlint config for snapshotting, stripping machine-specific
 * values (absolute dictionary URLs).
 *
 * @param config - The generated config to serialize.
 * @returns A JSON-safe structure.
 */
function serializeOxlintConfig(config: OxlintConfig): JsonValue {
	const serialized: unknown = JSON.parse(JSON.stringify(config, redactMachinePaths));
	return isRecord(serialized) ? serialized : null;
}
