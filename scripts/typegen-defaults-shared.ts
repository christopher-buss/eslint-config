/**
 * Machinery shared by `scripts/typegen-defaults.ts` (ESLint) and
 * `scripts/typegen-defaults-oxlint.ts`: the variant matrix, formatter probes,
 * entry normalization with its severity-only fallbacks, delta computation and
 * the defaults-file emitter. The scripts contribute only their
 * factory-specific extraction strategy.
 */
import fs from "node:fs/promises";

import type { VariantKey } from "../src/redundancy.ts";

/**
 * A normalized default entry: bare severity, `[severity, ...options]`, or the
 * dropped-options marker for entries whose options are environment-dependent
 * or unserializable (see `DroppedOptionsDefault` in `src/redundancy.ts`).
 */
export type RuleEntryJson = Array<unknown> | string | { severityOnly: string };

/** Effective entries for one scope in one variant. */
export type ScopeRules = Record<string, RuleEntryJson>;

/** The variant axes selected by one extraction run. */
export interface VariantAxes {
	roblox: boolean;
	type: "game" | "package";
}

/**
 * Every preset variant, matching the `VariantKey` union in `src/redundancy.ts`
 * (enforced by a type test).
 */
export const VARIANT_KEYS = [
	"game_roblox",
	"game_std",
	"package_roblox",
	"package_std",
] as const satisfies ReadonlyArray<VariantKey>;

/** Factory options selecting each variant; exhaustive by construction. */
export const VARIANT_OPTIONS: Record<VariantKey, VariantAxes> = {
	game_roblox: { roblox: true, type: "game" },
	game_std: { roblox: false, type: "game" },
	package_roblox: { roblox: true, type: "package" },
	package_std: { roblox: false, type: "package" },
};

/**
 * Two divergent formatter environments; any rule whose merged options differ
 * between them derives its options from the consumer's environment and is
 * downgraded to severity-only.
 */
export const FORMATTER_PROBES = [
	{ prettierOptions: { printWidth: 100, tabWidth: 4, useTabs: true } },
	{ prettierOptions: { printWidth: 78, tabWidth: 2, useTabs: false } },
] as const;

/** Includes oxlint's `allow`/`deny` aliases; harmless on the ESLint side. */
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

/**
 * Normalize a raw rule entry to string severities, downgrading unserializable
 * options to a severity-only entry.
 *
 * @param rawEntry - The rule entry as found in the merged config.
 * @returns The normalized entry and whether options were dropped.
 */
export function normalizeEntry(rawEntry: unknown): {
	entry: RuleEntryJson;
	severityOnly: boolean;
} {
	const asArray: Array<unknown> = Array.isArray(rawEntry) ? rawEntry : [rawEntry];
	const rawSeverity = asArray[0];
	const severity =
		typeof rawSeverity === "number" || typeof rawSeverity === "string"
			? SEVERITY_NAMES[rawSeverity]
			: undefined;
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

	const parsedOptions: unknown = JSON.parse(serialized);
	const optionValues: Array<unknown> = Array.isArray(parsedOptions) ? parsedOptions : [];
	return {
		entry: [severity, ...optionValues],
		severityOnly: false,
	};
}

/**
 * Combine the two formatter-probe extractions of one scope, downgrading
 * environment-sensitive rules to severity-only entries.
 *
 * @param first - Merged rules under the first formatter probe.
 * @param second - Merged rules under the second formatter probe.
 * @returns The combined scope rules.
 */
export function combineProbes(
	first: Record<string, unknown>,
	second: Record<string, unknown>,
): ScopeRules {
	const rules: ScopeRules = {};

	for (const [name, rawEntry] of Object.entries(first)) {
		const normalized = normalizeEntry(rawEntry);
		const secondRaw = second[name];
		const other = secondRaw === undefined ? undefined : normalizeEntry(secondRaw);
		if (other === undefined) {
			continue;
		}

		const matches = JSON.stringify(other.entry) === JSON.stringify(normalized.entry);
		if (!matches || normalized.severityOnly || other.severityOnly) {
			if (severityOf(normalized.entry) !== severityOf(other.entry)) {
				continue;
			}

			// The real default carries options that could not be captured;
			// the marker keeps that distinct from a truly bare severity.
			rules[name] = { severityOnly: severityOf(normalized.entry) };
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
export function deltaAgainst(scope: ScopeRules, chain: ReadonlyArray<ScopeRules>): ScopeRules {
	const delta: ScopeRules = {};

	for (const [name, entry] of Object.entries(scope)) {
		const baseline = chain.find((map) => name in map)?.[name];
		if (baseline === undefined || JSON.stringify(baseline) !== JSON.stringify(entry)) {
			delta[name] = entry;
		}
	}

	return delta;
}

/**
 * Fail generation loudly when an extraction looks broken — an empty scope or
 * a missing anchor rule means a factory return shape or a representative
 * file's globs drifted, which would otherwise silently emit defaults maps
 * that no-op the whole redundancy check.
 *
 * @param label - Generator + variant label for error messages.
 * @param scopes - The extracted scope rules.
 * @param mainScope - The scope that must contain `anchorRule`.
 * @param anchorRule - A rule the preset always enables in the main scope.
 */
export function assertExtractionSane(
	label: string,
	scopes: Record<string, ScopeRules>,
	mainScope: string,
	anchorRule: string,
): void {
	for (const [scope, scopeRules] of Object.entries(scopes)) {
		if (Object.keys(scopeRules).length === 0) {
			throw new Error(`[typegen-defaults] ${label}: scope "${scope}" extracted no rules`);
		}
	}

	const mainRules = scopes[mainScope] ?? {};
	if (!(anchorRule in mainRules) || Object.keys(mainRules).length < 100) {
		throw new Error(
			`[typegen-defaults] ${label}: main scope looks broken (${Object.keys(mainRules).length} rules, anchor "${anchorRule}" ${anchorRule in mainRules ? "present" : "missing"})`,
		);
	}
}

/**
 * Log per-scope rule counts for one extracted variant.
 *
 * @param prefix - Log-line prefix identifying the generator.
 * @param variant - The extracted variant.
 * @param scopes - The extracted scope rules.
 */
export function logVariantCounts(
	prefix: string,
	variant: VariantKey,
	scopes: Record<string, ScopeRules>,
): void {
	const counts = Object.entries(scopes)
		.map(([scope, scopeRules]) => `${scope} ${Object.keys(scopeRules).length}`)
		.join(", ");
	console.log(`${prefix}${variant}: ${counts}`);
}

/**
 * Emit the defaults `.d.ts` file: one interface per scope, entries keyed per
 * variant (or `"*"` when identical across variants).
 *
 * @param banner - Leading comment block for the generated file.
 * @param extractions - Extracted scope rules per variant.
 * @param interfaceNames - Interface name per scope.
 * @param outPath - Output path of the generated file.
 */
export async function writeDefaultsFile(
	banner: string,
	extractions: Record<string, Record<string, ScopeRules>>,
	interfaceNames: Record<string, string>,
	outPath: string,
): Promise<void> {
	const scopes = Object.keys(interfaceNames).toSorted();
	const interfaces = scopes.map((scope) => {
		return emitScopeInterface(
			interfaceNames[scope] ?? scope,
			(variant) => extractions[variant]?.[scope] ?? {},
		);
	});

	await fs.writeFile(outPath, `${banner}\n${interfaces.join("\n\n")}\n`);
	console.log(`Wrote ${outPath}`);
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

function severityOf(entry: RuleEntryJson): string {
	if (typeof entry === "string") {
		return entry;
	}

	if (Array.isArray(entry)) {
		const [first] = entry;
		return typeof first === "string" ? first : String(first);
	}

	return entry.severityOnly;
}

function emitScopeInterface(name: string, perVariant: (variant: VariantKey) => ScopeRules): string {
	const allNames = new Set(VARIANT_KEYS.flatMap((variant) => Object.keys(perVariant(variant))));
	const ruleNames = [...allNames].toSorted();

	const lines = ruleNames.map((rule) => {
		const values = VARIANT_KEYS.map((variant) => {
			const entry = perVariant(variant)[rule];
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
