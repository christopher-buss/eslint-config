/**
 * Generates `src/typegen-defaults.d.ts`: literal-typed maps of the preset's
 * effective default rule entries, consumed by the redundant-override check
 * (`redundancyCheck` option).
 *
 * Defaults are extracted by running the real factory per preset variant
 * (`type` x `roblox`) under a deterministic environment, then asking ESLint
 * itself (`calculateConfigForFile`) for the merged config of representative
 * virtual files — so the merge semantics can never drift from ESLint's.
 *
 * Two extraction runs per variant:
 *
 * - Base run (defaults only) → main scope (`src/index.ts`) plus the
 *   jsonc/yaml/toml/markdown file scopes.
 * - Features run (test + react + naming + eslintPlugin enabled) → the src
 *   feature delta, the test scope and the react (tsx) scope, each stored as a
 *   delta over the main scope to keep the emitted file small. Validation
 *   resolves rules through the chain scope → src feature delta → main.
 *
 * Environment sensitivity: every scope is extracted under two divergent
 * formatter environments; rules whose merged options differ between the two
 * derive their options from the consumer's environment
 * (Prettier/editorconfig/oxfmt values) and are downgraded to severity-only
 * entries — bare severity overrides are still flagged, option tuples are not.
 * The same downgrade applies to options that fail JSON round-tripping, exceed
 * a size cap, or embed machine-specific paths (for example the cspell
 * dictionary `file://` URLs).
 */
import { ESLint } from "eslint";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { isentinel } from "../src/eslint/index.ts";
import type { OptionsConfig, TypedFlatConfigItem } from "../src/eslint/types.ts";

type RuleEntryJson = Array<unknown> | string;

/** Effective entries for one scope in one variant. */
type ScopeRules = Record<string, RuleEntryJson>;

const VARIANT_KEYS = ["game_roblox", "game_std", "package_roblox", "package_std"] as const;
type Variant = (typeof VARIANT_KEYS)[number];

const VARIANT_OPTIONS = {
	game_roblox: { roblox: true, type: "game" },
	game_std: { roblox: false, type: "game" },
	package_roblox: { roblox: true, type: "package" },
	package_std: { roblox: false, type: "package" },
} satisfies Record<Variant, OptionsConfig>;

/**
 * Deterministic base options: no environment detection, no repo-specific
 * inputs, no oxlint hybrid dropping.
 */
const BASE_OPTIONS = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	oxlint: false,
	pnpm: false,
	redundancyCheck: false,
} satisfies OptionsConfig;

const FEATURE_OPTIONS = {
	eslintPlugin: true,
	naming: true,
	react: true,
	test: { jest: true, vitest: true },
} satisfies OptionsConfig;

/**
 * Two divergent formatter environments used to detect environment-derived
 * options.
 */
const FORMATTER_PROBES = [
	{ prettierOptions: { printWidth: 100, tabWidth: 4, useTabs: true } },
	{ prettierOptions: { printWidth: 78, tabWidth: 2, useTabs: false } },
] as const;

const SCOPE_FILES = {
	jsonc: "src/data.json",
	main: "src/index.ts",
	markdown: "src/README.md",
	react: "src/component.tsx",
	test: "src/component.test.ts",
	toml: "src/config.toml",
	yaml: "src/config.yaml",
} as const;
type ScopeFile = keyof typeof SCOPE_FILES;

const cwd = process.cwd();

const SEVERITY_NAMES: Record<number | string, string> = {
	0: "off",
	1: "warn",
	2: "error",
	error: "error",
	off: "off",
	warn: "warn",
};

/** Patterns marking option payloads as machine- or repo-specific. */
const ENVIRONMENT_PATTERN = /file:\/\/|[A-Za-z]:[\\/]|\/(?:home|Users)\//;

const MAX_OPTIONS_LENGTH = 2000;

interface VariantExtraction {
	jsonc: ScopeRules;
	main: ScopeRules;
	markdown: ScopeRules;
	react: ScopeRules;
	sourceFeature: ScopeRules;
	test: ScopeRules;
	toml: ScopeRules;
	yaml: ScopeRules;
}

async function resolveConfigs(
	options: Omit<OptionsConfig, "ignores">,
): Promise<Array<TypedFlatConfigItem>> {
	// The cast sidesteps the factory's redundancy-validation generics, which
	// cannot be satisfied by a spread of wide (non-literal) options types.
	return [...(await isentinel({ ...BASE_OPTIONS, ...options } as never))];
}

async function mergedRulesPerFile(
	configs: Array<TypedFlatConfigItem>,
	files: ReadonlyArray<string>,
): Promise<Array<Record<string, unknown>>> {
	const eslint = new ESLint({
		baseConfig: configs as never,
		cwd,
		overrideConfigFile: true,
	});

	return Promise.all(
		files.map(async (file) => {
			const config = (await eslint.calculateConfigForFile(path.join(cwd, file))) as
				| undefined
				| { rules?: Record<string, unknown> };
			return config?.rules ?? {};
		}),
	);
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
 * Combine the two formatter-probe extractions of one scope, downgrading
 * environment-sensitive rules to severity-only entries.
 *
 * @param first - Merged rules under the first formatter probe.
 * @param second - Merged rules under the second formatter probe.
 * @returns The combined scope rules.
 */
function combineProbes(
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

/**
 * Resolve one option set under both formatter probes and combine the merged
 * rules of each scope file.
 *
 * @template S - The scope names extracted by this run.
 * @param options - Factory options for this extraction run.
 * @param scopes - Scope names to extract, resolved to representative files.
 * @returns Combined rules per scope.
 */
async function extractScopes<const S extends ScopeFile>(
	options: Omit<OptionsConfig, "formatters" | "ignores">,
	scopes: ReadonlyArray<S>,
): Promise<Record<S, ScopeRules>> {
	const files = scopes.map((scope) => SCOPE_FILES[scope]);
	const [rulesA, rulesB] = await Promise.all(
		FORMATTER_PROBES.map(async (formatters) => {
			const configs = await resolveConfigs({ ...options, formatters });
			return mergedRulesPerFile(configs, files);
		}),
	);

	return Object.fromEntries(
		scopes.map((scope, index) => [
			scope,
			combineProbes(rulesA?.[index] ?? {}, rulesB?.[index] ?? {}),
		]),
	) as Record<S, ScopeRules>;
}

async function extractVariant(variant: Variant): Promise<VariantExtraction> {
	const variantOptions = VARIANT_OPTIONS[variant];

	const [baseScopes, featureScopes] = await Promise.all([
		extractScopes(variantOptions, ["main", "jsonc", "yaml", "toml", "markdown"]),
		extractScopes({ ...variantOptions, ...FEATURE_OPTIONS }, ["main", "test", "react"]),
	]);

	const { main } = baseScopes;
	const sourceFeature = deltaAgainst(featureScopes.main, [main]);

	return {
		jsonc: baseScopes.jsonc,
		main,
		markdown: baseScopes.markdown,
		react: deltaAgainst(featureScopes.react, [sourceFeature, main]),
		sourceFeature,
		test: deltaAgainst(featureScopes.test, [sourceFeature, main]),
		toml: baseScopes.toml,
		yaml: baseScopes.yaml,
	};
}

// ----- Emit -----

const SCOPE_INTERFACES: Record<keyof VariantExtraction, string> = {
	jsonc: "JsoncRuleDefaults",
	main: "MainRuleDefaults",
	markdown: "MarkdownRuleDefaults",
	react: "ReactRuleDefaults",
	sourceFeature: "SourceFeatureRuleDefaults",
	test: "TestRuleDefaults",
	toml: "TomlRuleDefaults",
	yaml: "YamlRuleDefaults",
};

function emitEntryType(entry: RuleEntryJson): string {
	return JSON.stringify(entry);
}

function emitScopeInterface(name: string, perVariant: Record<Variant, ScopeRules>): string {
	const allNames = new Set(VARIANT_KEYS.flatMap((variant) => Object.keys(perVariant[variant])));
	const ruleNames = [...allNames].toSorted();

	const lines = ruleNames.map((rule) => {
		const values = VARIANT_KEYS.map((variant) => {
			const entry = perVariant[variant][rule];
			return entry === undefined ? undefined : emitEntryType(entry);
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
	extractions[variant] = await extractVariant(variant);
	const scopes = extractions[variant];
	const counts = (Object.keys(scopes) as Array<keyof VariantExtraction>)
		.map((scope) => `${scope} ${Object.keys(scopes[scope]).length}`)
		.join(", ");
	console.log(`${variant}: ${counts}`);
}

const interfaces = (Object.keys(SCOPE_INTERFACES) as Array<keyof VariantExtraction>)
	.sort()
	.map((scope) => {
		const perVariant = Object.fromEntries(
			VARIANT_KEYS.map((variant) => [variant, extractions[variant][scope]]),
		) as Record<Variant, ScopeRules>;
		return emitScopeInterface(SCOPE_INTERFACES[scope], perVariant);
	});

const banner = `/* eslint-disable */
/* prettier-ignore */
// Generated by scripts/typegen-defaults.ts — do not edit.
// Effective preset defaults per scope, keyed per variant ("<type>_<roblox|std>",
// or "*" when identical across variants). Bare-severity entries mark rules
// whose options are environment-dependent (checked by severity only).
`;

await fs.writeFile("src/typegen-defaults.d.ts", `${banner}\n${interfaces.join("\n\n")}\n`);
console.log("Wrote src/typegen-defaults.d.ts");
