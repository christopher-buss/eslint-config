import picomatch from "picomatch";

import type { TypedFlatConfigItem } from "../src";
import type { OxlintConfig } from "../src/oxlint";

export type Severity = "enabled" | "off";

const MATCH_OPTIONS = { dot: true } as const;

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
