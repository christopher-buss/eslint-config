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
		const problems: Array<string> = [];

		for (const [rule, target] of Object.entries(oxlintRuleMapping)) {
			if (target === "js-plugin") {
				continue;
			}

			const translated = translateRuleToOxlint(rule);
			const lookup = translated.includes("/") ? translated : `eslint/${translated}`;
			const info = nativeRules.get(lookup);

			if (info === undefined) {
				problems.push(`${rule} -> ${translated} does not exist in oxlint`);
				continue;
			}

			if (target === "tsgolint" && !info.type_aware) {
				problems.push(`${rule} is mapped to tsgolint but is not type-aware`);
			}

			if (target === "native" && info.type_aware) {
				problems.push(`${rule} is mapped to native but requires type information`);
			}
		}

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
