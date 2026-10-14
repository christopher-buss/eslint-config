import { describe, it } from "vitest";

import { isentinel } from "../src/index.ts";
import type { TypedFlatConfigItem } from "../src/index.ts";
import {
	isOxlintCovered,
	isentinel as oxlintIsentinel,
	translateRuleToOxlint,
} from "../src/oxlint/index.ts";
import type { OxlintConfig } from "../src/oxlint/index.ts";
import { eslintConfigApplies, matchesPattern } from "./oxlint-helpers.ts";

interface RuleEntry {
	options: Array<unknown>;
	severity: unknown;
}

interface OptionsVariant {
	name: string;
	files: Array<string>;
	options: Record<string, unknown>;
}

/**
 * Split a rule entry into severity and options.
 *
 * @param value - The rule entry.
 * @returns The severity and the options (empty when the entry has none).
 */
function splitEntry(value: unknown): RuleEntry {
	return Array.isArray(value)
		? { options: value.slice(1), severity: value[0] }
		: { options: [], severity: value };
}

/**
 * Whether a severity turns the rule off.
 *
 * @param severity - A string or numeric ESLint severity.
 * @returns `true` for `"off"` and `0`.
 */
function isOff(severity: unknown): boolean {
	return severity === "off" || severity === 0;
}

/**
 * Apply a rule map onto an effective-entry map with ESLint's merge semantics:
 * an entry that gives only a severity keeps the earlier options.
 *
 * @param rules - The rule map to apply.
 * @param effective - The effective entry map (mutated).
 */
function applyEslintRules(rules: Record<string, unknown>, effective: Map<string, RuleEntry>): void {
	const entries = Object.entries(rules).filter(([, value]) => value !== undefined);
	for (const [rule, value] of entries) {
		const entry = splitEntry(value);
		const previous = effective.get(rule);
		effective.set(rule, {
			options: entry.options.length > 0 ? entry.options : (previous?.options ?? []),
			severity: entry.severity,
		});
	}
}

/**
 * Resolve the effective options of each enabled rule an ESLint flat config
 * array produces for a file. ESLint keeps the earlier options when a later
 * entry gives only a severity.
 *
 * @param configs - The resolved flat config items.
 * @param filePath - The file path to resolve for.
 * @returns Rule name to options, for enabled rules only.
 */
function effectiveEslintOptions(
	configs: Array<TypedFlatConfigItem>,
	filePath: string,
): Map<string, Array<unknown>> {
	const effective = new Map<string, RuleEntry>();

	for (const config of configs) {
		if (config.rules !== undefined && eslintConfigApplies(config, filePath)) {
			applyEslintRules(config.rules, effective);
		}
	}

	return new Map(
		[...effective].flatMap(([rule, { options, severity }]) => {
			return isOff(severity) ? [] : [[rule, options] as const];
		}),
	);
}

/**
 * Resolve the effective options of each enabled rule the generated oxlint
 * config produces for a file. A later entry replaces the earlier one outright.
 *
 * @param config - The generated oxlint config.
 * @param filePath - The file path to resolve for.
 * @returns Rule name to options, for enabled rules only.
 */
function effectiveOxlintOptions(
	config: OxlintConfig,
	filePath: string,
): Map<string, Array<unknown>> {
	const matching = (config.overrides ?? []).filter((override) => {
		const matchesFiles = override.files.some((pattern) => matchesPattern(filePath, pattern));
		const excluded = (override.excludeFiles ?? []).some((pattern) => {
			return matchesPattern(filePath, pattern);
		});

		return matchesFiles && !excluded;
	});

	const effective = new Map<string, unknown>();
	const ruleMaps = [config.rules, ...matching.map((override) => override.rules)];
	for (const rules of ruleMaps) {
		const entries = Object.entries(rules ?? {}).filter(([, value]) => value !== undefined);
		for (const [rule, value] of entries) {
			effective.set(rule, value);
		}
	}

	return new Map(
		[...effective].flatMap(([rule, value]) => {
			const { options, severity } = splitEntry(value);
			return isOff(severity) ? [] : [[rule, options] as const];
		}),
	);
}

/**
 * Rules both engines enable for a file but run with different options.
 *
 * @param filePath - The file path under comparison.
 * @param eslintOptions - Effective ESLint options.
 * @param oxlintOptions - Effective oxlint options.
 * @returns Human-readable problems.
 */
function findMismatchedOptions(
	filePath: string,
	eslintOptions: Map<string, Array<unknown>>,
	oxlintOptions: Map<string, Array<unknown>>,
): Array<string> {
	return [...eslintOptions].flatMap(([rule, options]) => {
		const translated = translateRuleToOxlint(rule);
		const oxlint = oxlintOptions.get(translated);
		const isMismatched =
			isOxlintCovered(rule) &&
			oxlint !== undefined &&
			JSON.stringify(oxlint) !== JSON.stringify(options);

		return isMismatched ? [`${filePath}: ${rule} -> ${translated}`] : [];
	});
}

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
} as const;

const variants: Array<OptionsVariant> = [
	{
		name: "roblox-game",
		files: ["src/services/service.ts", "src/components/component.tsx", "src/util.js"],
		options: { ...baseOptions },
	},
	{
		name: "package",
		files: ["src/index.ts", "src/utilities/helper.ts"],
		options: { ...baseOptions, roblox: false, type: "package" },
	},
	{
		name: "react",
		files: ["src/components/component.tsx"],
		options: { ...baseOptions, react: true },
	},
	{
		name: "jest",
		files: ["src/services/service.spec.ts", "src/util.test.ts"],
		options: { ...baseOptions, test: { jest: true } },
	},
	{
		name: "vitest",
		files: ["src/index.spec.ts", "src/util.test.ts"],
		options: { ...baseOptions, roblox: false, test: { vitest: true }, type: "package" },
	},
];

describe("oxlint per-file option parity", () => {
	describe.for(variants)("$name", (variant: OptionsVariant) => {
		it("should run each shared rule with the same options as ESLint", async ({ expect }) => {
			expect.assertions(1);

			const eslintOnly = [
				...(await isentinel({ name: "test/options-eslint", ...variant.options })),
			];
			const oxlintConfig = oxlintIsentinel({
				name: "test/options-oxlint",
				...variant.options,
			});

			const mismatched = variant.files.flatMap((filePath) => {
				return findMismatchedOptions(
					filePath,
					effectiveEslintOptions(eslintOnly, filePath),
					effectiveOxlintOptions(oxlintConfig, filePath),
				);
			});

			expect(mismatched).toStrictEqual([]);
		});
	});
});
