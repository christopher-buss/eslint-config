/**
 * Generates `src/oxlint/typegen-defaults.d.ts`: literal-typed maps of the
 * oxlint preset's effective default rule entries, consumed by the
 * redundant-override check (`redundancyCheck` option) of the oxlint factory.
 *
 * The oxlint factory is synchronous and returns a plain config whose rules all
 * live in ordered `overrides`, so extraction merges the overrides that match a
 * representative file per scope (last entry wins, whole-entry replacement).
 * Everything else mirrors `scripts/typegen-defaults.ts`: per-variant runs,
 * formatter probes for environment-derived options, and severity-only
 * fallbacks for unserializable payloads.
 */
import fs from "node:fs/promises";
import picomatch from "picomatch";

import { isentinel } from "../src/oxlint/index.ts";
import type { OxlintFactoryOptions } from "../src/oxlint/index.ts";

type RuleEntryJson = Array<unknown> | string;
type ScopeRules = Record<string, RuleEntryJson>;

const VARIANT_KEYS = ["game_roblox", "game_std", "package_roblox", "package_std"] as const;
type Variant = (typeof VARIANT_KEYS)[number];

const VARIANT_OPTIONS = {
	game_roblox: { roblox: true, type: "game" },
	game_std: { roblox: false, type: "game" },
	package_roblox: { roblox: true, type: "package" },
	package_std: { roblox: false, type: "package" },
} satisfies Record<Variant, Omit<OxlintFactoryOptions, "name">>;

/**
 * Deterministic base options: no environment detection and type-aware rules
 * pinned on so their defaults are covered.
 */
const BASE_OPTIONS = {
	name: "isentinel",
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	options: { typeAware: true },
	redundancyCheck: false,
} satisfies OxlintFactoryOptions;

const FEATURE_OPTIONS = {
	eslintPlugin: true,
	react: true,
	test: { jest: true, vitest: true },
} satisfies Omit<OxlintFactoryOptions, "name">;

/**
 * Two divergent formatter environments used to detect environment-derived
 * options.
 */
const FORMATTER_PROBES = [
	{ prettierOptions: { printWidth: 100, tabWidth: 4, useTabs: true } },
	{ prettierOptions: { printWidth: 78, tabWidth: 2, useTabs: false } },
] as const;

const SCOPE_FILES = {
	main: "src/index.ts",
	react: "src/component.tsx",
	test: "src/component.test.ts",
} as const;

const SEVERITY_NAMES: Record<number | string, string> = {
	0: "off",
	1: "warn",
	2: "error",
	allow: "off",
	deny: "error",
	error: "error",
	off: "off",
	warn: "warn",
};

/** Patterns marking option payloads as machine- or repo-specific. */
const ENVIRONMENT_PATTERN = /file:\/\/|[A-Za-z]:[\\/]|\/(?:home|Users)\//;

const MAX_OPTIONS_LENGTH = 2000;

interface VariantExtraction {
	main: ScopeRules;
	react: ScopeRules;
	sourceFeature: ScopeRules;
	test: ScopeRules;
}

function serializeOptions(options: Array<unknown>): string | undefined {
	let serialized: string;
	try {
		serialized = JSON.stringify(options);
	} catch {
		return undefined;
	}

	const roundTrips = JSON.stringify(JSON.parse(serialized)) === serialized;
	if (
		!roundTrips ||
		serialized.length > MAX_OPTIONS_LENGTH ||
		ENVIRONMENT_PATTERN.test(serialized)
	) {
		return undefined;
	}

	return serialized;
}

function normalizeEntry(rawEntry: unknown): { entry: RuleEntryJson; severityOnly: boolean } {
	const asArray = Array.isArray(rawEntry) ? rawEntry : [rawEntry];
	const severity = SEVERITY_NAMES[asArray[0] as number | string];
	if (severity === undefined) {
		throw new Error(`Unknown severity in entry: ${JSON.stringify(rawEntry)}`);
	}

	const options = asArray.slice(1);
	if (options.length === 0) {
		return { entry: severity, severityOnly: false };
	}

	const serialized = serializeOptions(options);
	if (serialized === undefined) {
		return { entry: severity, severityOnly: true };
	}

	return {
		entry: [severity, ...(JSON.parse(serialized) as Array<unknown>)],
		severityOnly: false,
	};
}

function severityOf(entry: RuleEntryJson): string {
	return Array.isArray(entry) ? (entry[0] as string) : entry;
}

/**
 * Merge the ordered overrides of one generated config for a representative
 * file. Later overrides replace earlier entries wholesale, matching oxlint's
 * behavior.
 *
 * @param options - Factory options for this run.
 * @param file - Representative file path for the scope.
 * @returns The merged raw rule entries.
 */
function mergedRulesForFile(
	options: Omit<OxlintFactoryOptions, "name">,
	file: string,
): Record<string, unknown> {
	// The cast sidesteps the factory's redundancy-validation generics, which
	// cannot be satisfied by a spread of wide (non-literal) options types.
	const config = isentinel({ ...BASE_OPTIONS, ...options } as never);
	const merged: Record<string, unknown> = {};
	const overrides = config.overrides ?? [];

	for (const override of overrides) {
		if (override.rules === undefined) {
			continue;
		}

		if (!picomatch.isMatch(file, override.files, { dot: true })) {
			continue;
		}

		Object.assign(merged, override.rules);
	}

	return merged;
}

/**
 * Extract one scope under both formatter probes, downgrading
 * environment-sensitive rules to severity-only entries.
 *
 * @param options - Factory options for this extraction run.
 * @param file - Representative file path for the scope.
 * @returns The combined scope rules.
 */
function extractScope(options: Omit<OxlintFactoryOptions, "name">, file: string): ScopeRules {
	const [first, second] = FORMATTER_PROBES.map((formatters) => {
		return mergedRulesForFile({ ...options, formatters }, file);
	}) as [Record<string, unknown>, Record<string, unknown>];

	const rules: ScopeRules = {};
	for (const [name, rawEntry] of Object.entries(first)) {
		const normalized = normalizeEntry(rawEntry);
		const secondRaw = second[name];
		const other = secondRaw === undefined ? undefined : normalizeEntry(secondRaw);
		if (other === undefined) {
			continue;
		}

		const matches = JSON.stringify(other.entry) === JSON.stringify(normalized.entry);
		if (normalized.severityOnly || other.severityOnly || !matches) {
			if (severityOf(normalized.entry) !== severityOf(other.entry)) {
				continue;
			}

			rules[name] = severityOf(normalized.entry);
			continue;
		}

		rules[name] = normalized.entry;
	}

	return rules;
}

/**
 * Entries of `scope` that differ from (or are missing in) the base chain.
 *
 * @param scope - The scope to diff.
 * @param chain - Ordered baseline maps, most specific first.
 * @returns The delta entries.
 */
function deltaAgainst(scope: ScopeRules, chain: ReadonlyArray<ScopeRules>): ScopeRules {
	const delta: ScopeRules = {};

	for (const [name, entry] of Object.entries(scope)) {
		const baseline = chain.find((map) => name in map)?.[name];
		if (baseline === undefined || JSON.stringify(baseline) !== JSON.stringify(entry)) {
			delta[name] = entry;
		}
	}

	return delta;
}

function extractVariant(variant: Variant): VariantExtraction {
	const variantOptions = VARIANT_OPTIONS[variant];
	const featureOptions = { ...variantOptions, ...FEATURE_OPTIONS };

	const main = extractScope(variantOptions, SCOPE_FILES.main);
	const featureMain = extractScope(featureOptions, SCOPE_FILES.main);
	const sourceFeature = deltaAgainst(featureMain, [main]);

	return {
		main,
		react: deltaAgainst(extractScope(featureOptions, SCOPE_FILES.react), [sourceFeature, main]),
		sourceFeature,
		test: deltaAgainst(extractScope(featureOptions, SCOPE_FILES.test), [sourceFeature, main]),
	};
}

// ----- Emit -----

const SCOPE_INTERFACES: Record<keyof VariantExtraction, string> = {
	main: "OxlintMainRuleDefaults",
	react: "OxlintReactRuleDefaults",
	sourceFeature: "OxlintSourceFeatureRuleDefaults",
	test: "OxlintTestRuleDefaults",
};

/**
 * Emit one scope interface with per-variant (or `"*"`) entries.
 *
 * @param name - Name for the emitted interface.
 * @param perVariant - The scope rules per variant.
 * @returns The interface source text.
 */
function emitScopeInterface(name: string, perVariant: Record<Variant, ScopeRules>): string {
	const allNames = new Set(VARIANT_KEYS.flatMap((variant) => Object.keys(perVariant[variant])));
	const ruleNames = [...allNames].toSorted();

	const lines = ruleNames.map((rule) => {
		const values = VARIANT_KEYS.map((variant) => {
			const entry = perVariant[variant][rule];
			return entry === undefined ? undefined : JSON.stringify(entry);
		});

		const present = values.filter((value) => value !== undefined);
		const distinctValues = new Set(present);
		const invariant = present.length === VARIANT_KEYS.length && distinctValues.size === 1;

		if (invariant) {
			return `\t${JSON.stringify(rule)}: { "*": ${present[0]} };`;
		}

		const variantEntries = VARIANT_KEYS.flatMap((variant, index) => {
			const value = values[index];
			return value === undefined ? [] : [`${variant}: ${value}`];
		});
		return `\t${JSON.stringify(rule)}: { ${variantEntries.join("; ")} };`;
	});

	return `export interface ${name} {\n${lines.join("\n")}\n}`;
}

const extractions = {} as Record<Variant, VariantExtraction>;
for (const variant of VARIANT_KEYS) {
	extractions[variant] = extractVariant(variant);
	const scopes = extractions[variant];
	const counts = (Object.keys(scopes) as Array<keyof VariantExtraction>)
		.map((scope) => `${scope} ${Object.keys(scopes[scope]).length}`)
		.join(", ");
	console.log(`oxlint ${variant}: ${counts}`);
}

const interfaces = (Object.keys(SCOPE_INTERFACES) as Array<keyof VariantExtraction>)
	.toSorted()
	.map((scope) => {
		const perVariant = Object.fromEntries(
			VARIANT_KEYS.map((variant) => [variant, extractions[variant][scope]]),
		) as Record<Variant, ScopeRules>;
		return emitScopeInterface(SCOPE_INTERFACES[scope], perVariant);
	});

const banner = `/* eslint-disable */
/* prettier-ignore */
// Generated by scripts/typegen-defaults-oxlint.ts — do not edit.
// Effective oxlint preset defaults per scope, keyed per variant
// ("<type>_<roblox|std>", or "*" when identical across variants).
// Bare-severity entries mark rules whose options are environment-dependent
// (checked by severity only).
`;

await fs.writeFile("src/oxlint/typegen-defaults.d.ts", `${banner}\n${interfaces.join("\n\n")}\n`);
console.log("Wrote src/oxlint/typegen-defaults.d.ts");
