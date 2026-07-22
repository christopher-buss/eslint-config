import picomatch from "picomatch";

import type { TypedFlatConfigItem } from "../src/index.ts";
import type { OxlintConfig } from "../src/oxlint/index.ts";

export type Severity = "enabled" | "off";

const MATCH_OPTIONS = { dot: true } as const;

/**
 * Add every enabled rule from a rule map to the given set.
 *
 * @param rules - The rule map to scan.
 * @param enabled - The set collecting enabled rule names.
 */
export function collectEnabledRules(
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
 * Unlike {@link effectiveEslintRules} this is a union across every config, not
 * a last-wins resolution for one file.
 *
 * @param configs - The resolved flat config items.
 * @returns The enabled rule names.
 */
export function enabledEslintRules(configs: Array<TypedFlatConfigItem>): Set<string> {
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
export function enabledOxlintRules(config: OxlintConfig): Set<string> {
	const enabled = new Set<string>();

	collectEnabledRules(config.rules, enabled);
	const overrides = config.overrides ?? [];
	for (const override of overrides) {
		collectEnabledRules(override.rules, enabled);
	}

	return enabled;
}

/**
 * Whether a file path matches a single glob pattern.
 *
 * @param filePath - The file path to test.
 * @param pattern - The glob pattern.
 * @returns Whether the path matches.
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
	return picomatch.isMatch(filePath, pattern, MATCH_OPTIONS);
}

/**
 * Apply a rule map onto an effective-severity map (later entries win).
 *
 * @param rules - The rule map to apply.
 * @param effective - The effective severity map (mutated).
 */
export function applyRules(
	rules: Record<string, unknown> | undefined,
	effective: Map<string, Severity>,
): void {
	const entries = Object.entries(rules ?? {});
	for (const [rule, value] of entries) {
		if (value === undefined) {
			continue;
		}

		const severity = Array.isArray(value) ? (value[0] as unknown) : value;
		effective.set(rule, severity === "off" || severity === 0 ? "off" : "enabled");
	}
}

/**
 * Whether an ESLint flat config item applies to the given file path,
 * approximating ESLint's semantics: configs apply when they have no `files` or
 * when any pattern (AND for nested arrays) matches, minus per-config
 * `ignores`.
 *
 * @param config - The flat config item.
 * @param filePath - The file path to resolve for.
 * @returns Whether the config applies.
 */
export function eslintConfigApplies(
	{ files, ignores = [] }: TypedFlatConfigItem,
	filePath: string,
): boolean {
	const matchesFiles =
		files === undefined
			? true
			: files.some((pattern) => {
					return Array.isArray(pattern)
						? pattern.every((part) => matchesPattern(filePath, part))
						: matchesPattern(filePath, pattern);
				});

	const isIgnored = ignores.some(
		(pattern) => typeof pattern === "string" && matchesPattern(filePath, pattern),
	);

	return matchesFiles && !isIgnored;
}

/**
 * Resolve the effective rule severities an ESLint flat config array produces
 * for a file; later configs win.
 *
 * @param configs - The resolved flat config items.
 * @param filePath - The file path to resolve for.
 * @returns Rule name to effective severity.
 */
export function effectiveEslintRules(
	configs: Array<TypedFlatConfigItem>,
	filePath: string,
): Map<string, Severity> {
	const effective = new Map<string, Severity>();

	for (const config of configs) {
		if (config.rules !== undefined && eslintConfigApplies(config, filePath)) {
			applyRules(config.rules, effective);
		}
	}

	return effective;
}

/**
 * Resolve the effective rule severities the generated oxlint config produces
 * for a file: top-level rules apply everywhere, overrides in order (later
 * wins) when `files` match and `excludeFiles` do not.
 *
 * @param config - The generated oxlint config.
 * @param filePath - The file path to resolve for.
 * @returns Rule name to effective severity.
 */
export function effectiveOxlintRules(
	config: OxlintConfig,
	filePath: string,
): Map<string, Severity> {
	const effective = new Map<string, Severity>();

	applyRules(config.rules, effective);

	const overrides = config.overrides ?? [];
	for (const override of overrides) {
		const matchesFiles = override.files.some((pattern) => matchesPattern(filePath, pattern));
		const excluded = (override.excludeFiles ?? []).some((pattern) => {
			return matchesPattern(filePath, pattern);
		});

		if (matchesFiles && !excluded) {
			applyRules(override.rules, effective);
		}
	}

	return effective;
}

/**
 * Collect the enabled rule names from an effective severity map.
 *
 * @param effective - The effective severity map.
 * @returns The enabled rule names.
 */
export function enabledFromEffective(effective: Map<string, Severity>): Set<string> {
	const enabled = new Set<string>();
	for (const [rule, severity] of effective) {
		if (severity === "enabled") {
			enabled.add(rule);
		}
	}

	return enabled;
}
