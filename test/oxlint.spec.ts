import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { describe, it } from "vitest";

import { isentinel } from "../src";
import type { TypedFlatConfigItem } from "../src";
import {
	isOxlintCovered,
	isentinel as oxlintIsentinel,
	oxlintRuleMapping,
	translateRuleToOxlint,
} from "../src/oxlint";
import type { OxlintConfig } from "../src/oxlint";
import { effectiveEslintRules, enabledFromEffective } from "./oxlint-helpers";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

interface OxlintRuleInfo {
	scope: string;
	type_aware: boolean;
	value: string;
}

interface HybridVariant {
	name: string;
	eslintOptions: Record<string, unknown>;
	oxlintOptions: Record<string, unknown>;
}

/**
 * Query the installed oxlint binary for its native rule list.
 *
 * @returns Native rule metadata keyed by `scope/rule`.
 */
function getOxlintNativeRules(): Map<string, OxlintRuleInfo> {
	const binaryName = process.platform === "win32" ? "oxlint.CMD" : "oxlint";
	const binary = path.join(PROJECT_ROOT, "node_modules", ".bin", binaryName);
	const output = execFileSync(binary, ["--rules", "-f", "json"], {
		encoding: "utf8",
		shell: process.platform === "win32",
	});

	const rules = new Map<string, OxlintRuleInfo>();
	const ruleList = JSON.parse(output) as Array<OxlintRuleInfo>;
	for (const rule of ruleList) {
		rules.set(`${rule.scope}/${rule.value}`, rule);
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
		override.files.some((glob) => String(glob).includes(".d.")) &&
		override.rules?.["oxc/no-barrel-file"] === "off"
	);
}

/**
 * Add every enabled rule from a rule map to the given set.
 *
 * @param rules - The rule map to scan.
 * @param enabled - The set collecting enabled rule names.
 */
function collectEnabledRules(
	rules: Record<string, unknown> | undefined,
	enabled: Set<string>,
): void {
	const entries = Object.entries(rules ?? {});
	for (const [rule, value] of entries) {
		if (value === undefined) {
			continue;
		}

		const severity = Array.isArray(value) ? (value[0] as unknown) : value;
		if (severity !== "off" && severity !== 0) {
			enabled.add(rule);
		}
	}
}

/**
 * Collect all rule names with a non-"off" entry anywhere in the configs.
 * Markdown-code sibling configs (synthesized by hybrid mode to keep dropped
 * rules alive inside Markdown code blocks) are excluded so the hybrid drop is
 * visible to the comparison.
 *
 * @param configs - The resolved flat config items.
 * @returns The enabled rule names.
 */
function enabledEslintRules(configs: Array<TypedFlatConfigItem>): Set<string> {
	const enabled = new Set<string>();

	for (const config of configs) {
		if (config.name?.endsWith("/markdown-code") === true) {
			continue;
		}

		collectEnabledRules(config.rules, enabled);
	}

	return enabled;
}

/**
 * Collect all enabled rule names from an oxlint config.
 *
 * @param config - The generated oxlint config.
 * @returns The enabled rule names.
 */
function enabledOxlintRules(config: OxlintConfig): Set<string> {
	const enabled = new Set<string>();

	collectEnabledRules(config.rules, enabled);
	const overrides = config.overrides ?? [];
	for (const override of overrides) {
		collectEnabledRules(override.rules, enabled);
	}

	return enabled;
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
			expect.hasAssertions();

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
			const dropped = [...enabledBefore].filter((rule) => !enabledAfter.has(rule));

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
		expect.hasAssertions();

		const nativeRules = getOxlintNativeRules();
		const problems = Object.entries(oxlintRuleMapping)
			.filter(([, target]) => target !== "js-plugin")
			.flatMap(([rule, target]) => nativeMappingProblems(rule, target, nativeRules));

		expect(problems).toStrictEqual([]);
	});
});

describe("oxlint config snapshots", () => {
	it("should match the default roblox game config", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/oxlint-roblox-game",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
		});

		expect(serializeOxlintConfig(config)).toMatchSnapshot();
	});

	it("should match the package config", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/oxlint-package",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			roblox: false,
			test: { jest: true },
			type: "package",
		});

		expect(serializeOxlintConfig(config)).toMatchSnapshot();
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
		expect.hasAssertions();

		const config = oxlintIsentinel({ name: "test/oxlint-categories-default" });

		expect(config.categories).toStrictEqual(ALL_CATEGORIES_OFF);
	});

	it("should merge a user category over the defaults", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/oxlint-categories-merge",
			categories: { nursery: "warn" },
		});

		expect(config.categories).toStrictEqual({ ...ALL_CATEGORIES_OFF, nursery: "warn" });
	});

	it("should let a user value win over a default of the same key", ({ expect }) => {
		expect.hasAssertions();

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
		expect.hasAssertions();

		const config = oxlintIsentinel({ name: "test/oxc-game", ...baseOptions });

		expect(enabledOxcRules(config)).toStrictEqual(OXC_GLOBAL_RULES.toSorted());
	});

	it("should add the non-roblox oxc rules for a package config", ({ expect }) => {
		expect.hasAssertions();

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
		expect.hasAssertions();

		const config = oxlintIsentinel({ name: "test/oxc-plugin", ...baseOptions });

		expect(config.plugins).toContain("oxc");
	});

	it("should omit every oxc rule when oxc is disabled", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({ ...baseOptions, name: "test/oxc-off", oxc: false });

		expect(enabledOxcRules(config)).toStrictEqual([]);
	});

	it("should route a user oxc rule override to the native side", ({ expect }) => {
		expect.hasAssertions();

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
			(override) => override.rules?.["oxc/no-const-enum"] === "error",
		);

		expect(config.plugins).toContain("oxc");
		expect(emitted).toBe(true);
	});

	it("should disable oxc/no-barrel-file for declaration files", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({ name: "test/oxc-dts", ...baseOptions });

		const disabled = config.overrides!.some(disablesBarrelFileForDts);

		expect(disabled).toBe(true);
	});

	it("should preserve a user oxc rule disable", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			...baseOptions,
			name: "test/oxc-user-disable",
			rules: { "oxc/no-barrel-file": "off" },
		});

		const disabled = config.overrides!.some(
			(override) => override.rules?.["oxc/no-barrel-file"] === "off",
		);

		expect(disabled).toBe(true);
	});

	it("should treat rules covered by a native oxc rule as oxlint-covered", ({ expect }) => {
		expect.hasAssertions();

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
		expect.hasAssertions();

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

describe("scoped roblox complement", () => {
	function nodeOverrides(config: OxlintConfig): NonNullable<OxlintConfig["overrides"]> {
		return (config.overrides ?? []).filter((override) => {
			return Object.keys(override.rules ?? {}).some((rule) => rule.startsWith("node/"));
		});
	}

	it("applies node rules to the complement with the roblox scope excluded", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/scoped-roblox",
			gitignore: false,
			roblox: { files: ["src/**"] },
			spellCheck: false,
		});

		const overrides = nodeOverrides(config);

		expect(overrides.length).toBeGreaterThan(0);

		for (const override of overrides) {
			expect(override.excludeFiles).toStrictEqual(["src/**"]);
		}
	});

	it("adds no node rules to the default roblox config", ({ expect }) => {
		expect.hasAssertions();

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
function serializeOxlintConfig(config: OxlintConfig): unknown {
	return JSON.parse(
		JSON.stringify(config, (_key, value: unknown) => {
			if (typeof value === "string" && value.startsWith("file:///")) {
				return `<dict>/${path.posix.basename(value)}`;
			}

			return value;
		}),
	);
}
