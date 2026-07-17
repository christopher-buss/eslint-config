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
 * Environment-sensitivity handling (formatter probes, severity-only
 * fallbacks) is documented in `scripts/typegen-defaults-shared.ts`.
 */
import { ESLint } from "eslint";
import path from "node:path";
import process from "node:process";

import { isentinel } from "../src/eslint/index.ts";
import type { OptionsConfig, TypedFlatConfigItem } from "../src/eslint/types.ts";
import type { ScopeRules } from "./typegen-defaults-shared.ts";
import {
	assertExtractionSane,
	combineProbes,
	deltaAgainst,
	FORMATTER_PROBES,
	logVariantCounts,
	VARIANT_KEYS,
	VARIANT_OPTIONS,
	writeDefaultsFile,
} from "./typegen-defaults-shared.ts";

type Variant = (typeof VARIANT_KEYS)[number];

type GeneratorOptions = Omit<OptionsConfig, "ignores">;

/**
 * The factory retyped without its redundancy-validation generics, which cannot
 * infer against wide (non-literal) options types. Options stay fully checked
 * against `OptionsConfig`; awaiting the returned composer yields the resolved
 * config array.
 */
const buildConfigs = isentinel as unknown as (
	options: GeneratorOptions,
) => Promise<Array<TypedFlatConfigItem>>;

/**
 * Deterministic base options: no environment detection, no repo-specific
 * inputs, no oxlint hybrid dropping.
 */
const BASE_OPTIONS: GeneratorOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	oxlint: false,
	pnpm: false,
};

const FEATURE_OPTIONS: GeneratorOptions = {
	eslintPlugin: true,
	naming: true,
	react: true,
	test: { jest: true, vitest: true },
};

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
	options: GeneratorOptions,
	scopes: ReadonlyArray<S>,
): Promise<Record<S, ScopeRules>> {
	const files = scopes.map((scope) => SCOPE_FILES[scope]);
	const [rulesA, rulesB] = await Promise.all(
		FORMATTER_PROBES.map(async (formatters) => {
			const configs = await buildConfigs({ ...BASE_OPTIONS, ...options, formatters });
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

const extractionEntries = await Promise.all(
	VARIANT_KEYS.map(async (variant) => {
		return [variant, await extractVariant(variant)] as const;
	}),
);
const extractions = Object.fromEntries(extractionEntries) as Record<Variant, VariantExtraction>;
for (const [variant, scopes] of extractionEntries) {
	assertExtractionSane(variant, scopes, "main", "no-alert");
	logVariantCounts("", variant, scopes);
}

const banner = `/* eslint-disable */
/* prettier-ignore */
// Generated by scripts/typegen-defaults.ts — do not edit.
// Effective preset defaults per scope, keyed per variant ("<type>_<roblox|std>",
// or "*" when identical across variants). \`{ severityOnly }\` markers denote
// defaults whose real options are environment-dependent and were not captured.
`;

await writeDefaultsFile(
	banner,
	extractions,
	{
		jsonc: "JsoncRuleDefaults",
		main: "MainRuleDefaults",
		markdown: "MarkdownRuleDefaults",
		react: "ReactRuleDefaults",
		sourceFeature: "SourceFeatureRuleDefaults",
		test: "TestRuleDefaults",
		toml: "TomlRuleDefaults",
		yaml: "YamlRuleDefaults",
	},
	"src/typegen-defaults.d.ts",
);
