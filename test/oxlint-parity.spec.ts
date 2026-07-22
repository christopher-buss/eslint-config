import { isPackageExists } from "local-pkg";
import { describe, it } from "vitest";

import { isRecord } from "../src/guards.ts";
import { isentinel } from "../src/index.ts";
import {
	isOxlintCovered,
	isentinel as oxlintIsentinel,
	oxlintJsPlugins,
	translateRuleToOxlint,
} from "../src/oxlint/index.ts";
import type { OxlintConfig } from "../src/oxlint/index.ts";
import type { Severity } from "./oxlint-helpers.ts";
import { effectiveEslintRules, effectiveOxlintRules } from "./oxlint-helpers.ts";

interface ParityVariant {
	name: string;
	files: Array<string>;
	options: Record<string, unknown>;
}

/**
 * Coverage direction: every mapped rule enabled in ESLint-only must be enabled
 * in oxlint for the same file.
 *
 * @param filePath - The file path under comparison.
 * @param eslintEffective - Effective ESLint severities.
 * @param oxlintEffective - Effective oxlint severities.
 * @returns Human-readable problems.
 */
/**
 * Resolve the registered name of a jsPlugin entry.
 *
 * @param plugin - The plugin entry, either a bare specifier or a named object.
 * @returns The name under which the plugin is registered.
 */
function jsPluginName(plugin: string | { name: string }): string {
	return typeof plugin === "string" ? plugin : plugin.name;
}

function findMissingCoverage(
	filePath: string,
	eslintEffective: Map<string, Severity>,
	oxlintEffective: Map<string, Severity>,
): Array<string> {
	const missing: Array<string> = [];

	for (const [rule, severity] of eslintEffective) {
		if (severity !== "enabled" || !isOxlintCovered(rule)) {
			continue;
		}

		const translated = translateRuleToOxlint(rule);
		if (oxlintEffective.get(translated) !== "enabled") {
			missing.push(`${filePath}: ${rule} -> ${translated}`);
		}
	}

	return missing;
}

/**
 * Over-reporting direction: rules ESLint-only effectively disables for a file
 * must not be enabled by oxlint (e.g. `no-undef` on TS files, formatter-compat
 * style disables).
 *
 * @param filePath - The file path under comparison.
 * @param eslintEffective - Effective ESLint severities.
 * @param oxlintEffective - Effective oxlint severities.
 * @returns Human-readable problems.
 */
function findOverReported(
	filePath: string,
	eslintEffective: Map<string, Severity>,
	oxlintEffective: Map<string, Severity>,
): Array<string> {
	// Translated names of every rule ESLint effectively enables: another
	// ESLint rule (e.g. the ts/ extension variant) may enable the same oxlint
	// rule that a base rule disables.
	const enabledTranslations = new Set<string>();
	for (const [rule, severity] of eslintEffective) {
		if (severity === "enabled") {
			enabledTranslations.add(translateRuleToOxlint(rule));
		}
	}

	const overReported: Array<string> = [];
	for (const [rule, severity] of eslintEffective) {
		if (severity !== "off") {
			continue;
		}

		const translated = translateRuleToOxlint(rule);
		if (!enabledTranslations.has(translated) && oxlintEffective.get(translated) === "enabled") {
			overReported.push(`${filePath}: ${rule} -> ${translated}`);
		}
	}

	return overReported;
}

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
} as const;

const variants: Array<ParityVariant> = [
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
	{
		// Exercises the disables scope globs (dts/test/bin/scripts/cli/root) on
		// both engines so a glob divergence surfaces as a parity failure.
		name: "scopes",
		files: [
			"src/types/env.d.ts",
			"src/services/service.spec.ts",
			"src/util.test.ts",
			"bin/run.ts",
			"scripts/build.ts",
			"src/cli/run.ts",
			"build.config.ts",
		],
		options: { ...baseOptions },
	},
];

describe("oxlint per-file severity parity", () => {
	describe.for(variants)("$name", (variant: ParityVariant) => {
		it("should agree with the ESLint-only config on effective severities", async ({
			expect,
		}) => {
			expect.hasAssertions();

			const eslintOnly = [
				...(await isentinel({ name: "test/parity-eslint", ...variant.options })),
			];
			const oxlintConfig = oxlintIsentinel({
				name: "test/parity-oxlint",
				...variant.options,
			});

			const missing: Array<string> = [];
			const overReported: Array<string> = [];
			for (const filePath of variant.files) {
				const eslintEffective = effectiveEslintRules(eslintOnly, filePath);
				const oxlintEffective = effectiveOxlintRules(oxlintConfig, filePath);

				missing.push(...findMissingCoverage(filePath, eslintEffective, oxlintEffective));
				overReported.push(...findOverReported(filePath, eslintEffective, oxlintEffective));
			}

			expect(missing).toStrictEqual([]);
			expect(overReported).toStrictEqual([]);
		});
	});
});

/**
 * Collect all enabled jsPlugin-prefixed rules per plugin alias from a
 * generated oxlint config.
 *
 * @param config - The generated oxlint config.
 * @param specifiers - Registered jsPlugin aliases.
 * @returns Rule names per plugin alias.
 */
function collectEmittedJsPluginRules(
	config: OxlintConfig,
	specifiers: Map<string, string>,
): Map<string, Set<string>> {
	const emitted = new Map<string, Set<string>>();

	/**
	 * Record the jsPlugin-prefixed enabled rules of one rule map.
	 *
	 * @param rules - The rule map to scan.
	 */
	function collectFrom(rules: Record<string, unknown> | undefined): void {
		const entries = Object.entries(rules ?? {});
		for (const [rule, value] of entries) {
			const severity = Array.isArray(value) ? (value[0] as unknown) : value;
			if (value === undefined || severity === "off" || severity === 0) {
				continue;
			}

			const slashIndex = rule.indexOf("/");
			const prefix = slashIndex === -1 ? "" : rule.slice(0, slashIndex);
			if (prefix === "" || !specifiers.has(prefix)) {
				continue;
			}

			const rulesForPlugin = emitted.get(prefix) ?? new Set<string>();
			rulesForPlugin.add(rule.slice(slashIndex + 1));
			emitted.set(prefix, rulesForPlugin);
		}
	}

	collectFrom(config.rules);
	const overrides = config.overrides ?? [];
	for (const override of overrides) {
		collectFrom(override.rules);
	}

	return emitted;
}

/**
 * Registered jsPlugin aliases (alias to package specifier) of a generated
 * oxlint config.
 *
 * @param config - The generated oxlint config.
 * @returns Alias to specifier.
 */
function jsPluginSpecifiers(config: OxlintConfig): Map<string, string> {
	const specifiers = new Map<string, string>();
	const jsPlugins = config.jsPlugins ?? [];
	for (const jsPlugin of jsPlugins) {
		if (typeof jsPlugin !== "string") {
			specifiers.set(jsPlugin.name, jsPlugin.specifier);
		}
	}

	return specifiers;
}

/**
 * Read the `rules` record off a dynamically imported plugin module, tolerating
 * both default and namespace exports.
 *
 * @param module_ - The imported module namespace.
 * @returns The plugin's rule definitions, or an empty record.
 */
function extractPluginRules(module_: unknown): Record<string, unknown> {
	if (!isRecord(module_)) {
		return {};
	}

	const base = isRecord(module_["default"]) ? module_["default"] : module_;
	return isRecord(base["rules"]) ? base["rules"] : {};
}

/**
 * Whether a rule's runtime metadata declares that it requires type information.
 *
 * @param rule - A plugin rule definition of unknown shape.
 * @returns Whether `meta.docs.requiresTypeChecking` is `true`.
 */
function ruleRequiresTypeChecking(rule: unknown): boolean {
	if (!isRecord(rule) || !isRecord(rule["meta"])) {
		return false;
	}

	const { docs } = rule["meta"];
	return isRecord(docs) && docs["requiresTypeChecking"] === true;
}

/**
 * Check one plugin's emitted rules against its runtime metadata.
 *
 * @param prefix - The jsPlugin alias.
 * @param specifier - The plugin package specifier.
 * @param ruleNames - The emitted rule names (without prefix).
 * @returns Human-readable problems for rules that require type information.
 */
async function findTypeAwareRulesInPlugin(
	prefix: string,
	specifier: string,
	ruleNames: Set<string>,
): Promise<Array<string>> {
	const module_: unknown = await import(specifier);
	const rules = extractPluginRules(module_);

	const problems: Array<string> = [];
	for (const ruleName of ruleNames) {
		if (ruleRequiresTypeChecking(rules[ruleName])) {
			problems.push(`${prefix}/${ruleName} (${specifier}) requires type information`);
		}
	}

	return problems;
}

/**
 * Find every emitted jsPlugin rule of a generated config that requires type
 * information (per the plugins' runtime metadata).
 *
 * @param config - The generated oxlint config.
 * @returns Human-readable problems.
 */
async function findTypeAwareEmissions(config: OxlintConfig): Promise<Array<string>> {
	const specifiers = jsPluginSpecifiers(config);
	const emittedByPlugin = collectEmittedJsPluginRules(config, specifiers);

	const problems: Array<string> = [];
	for (const [prefix, ruleNames] of emittedByPlugin) {
		const specifier = specifiers.get(prefix);
		if (specifier !== undefined && specifier !== "oxlint-plugin-oxlint-comments") {
			problems.push(...(await findTypeAwareRulesInPlugin(prefix, specifier, ruleNames)));
		}
	}

	return problems;
}

describe("oxlint options-level rules", () => {
	it("should let options.rules override the preset for source files", ({ expect }) => {
		expect.hasAssertions();

		// no-console is enabled by the preset's javascript config
		const config = oxlintIsentinel({
			name: "test/options-rules",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			rules: { "no-console": "off" },
		});

		const effective = effectiveOxlintRules(config, "src/services/service.ts");

		expect(effective.get("no-console")).toBe("off");
	});

	it("should let explicit user configs win over options.rules", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel(
			{
				name: "test/options-rules",
				gitignore: false,
				isAgent: false,
				isInEditor: false,
				rules: { "no-console": "off" },
			},
			{
				name: "user/override",
				files: ["src/**"],
				rules: { "no-console": "error" },
			},
		);

		const effective = effectiveOxlintRules(config, "src/services/service.ts");

		expect(effective.get("no-console")).toBe("enabled");
	});

	it("should translate and register jsPlugin rules from options.rules", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/options-js-plugin",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			roblox: false,
			rules: { "no-restricted-syntax": "off" },
			type: "package",
		});

		const translated = translateRuleToOxlint("no-restricted-syntax");
		const effective = effectiveOxlintRules(config, "src/index.ts");
		const registered = config.jsPlugins!.map(jsPluginName);

		expect(effective.get(translated)).toBe("off");
		expect(registered).toContain("eslint-js");
	});

	it("should preserve unmapped off entries from options.rules", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/options-unmapped-off",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			rules: { "react-x/no-nested-component-definitions": "off" },
		});

		const effective = effectiveOxlintRules(config, "src/index.ts");

		expect(effective.get("react-x/no-nested-component-definitions")).toBe("off");
	});
});

describe("oxlint linter options", () => {
	it("should enable typeAware by default", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/linter-options",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
		});

		expect(config.options).toStrictEqual({ typeAware: true });
	});

	it("should merge user options over the defaults", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/linter-options",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			options: { maxWarnings: 10, typeAware: false },
		});

		expect(config.options).toStrictEqual({ maxWarnings: 10, typeAware: false });
	});
});

describe("oxlint env and globals", () => {
	it("should pass env and globals through to the top level", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/env-globals",
			env: { browser: true, node: false },
			gitignore: false,
			globals: { MyGlobal: "readonly" },
			isAgent: false,
			isInEditor: false,
		});

		expect(config.env).toStrictEqual({ browser: true, node: false });
		expect(config.globals).toStrictEqual({ MyGlobal: "readonly" });
	});

	it("should emit user globals as a trailing override that beats the preset", ({ expect }) => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/env-globals",
			gitignore: false,
			globals: { window: "off" },
			isAgent: false,
			isInEditor: false,
		});

		const overrides = config.overrides!;
		const withWindow = overrides
			.map((override, index) => ({ index, value: override.globals?.["window"] }))
			.filter((entry) => entry.value !== undefined);

		expect(withWindow.length).toBeGreaterThanOrEqual(2);
		expect(withWindow[0]?.value).toBe("readonly");
		expect(withWindow.at(-1)?.value).toBe("off");
	});
});

function enabledJsdocRules(effective: Map<string, Severity>, translate: boolean): Set<string> {
	const rules = new Set<string>();
	for (const [rule, severity] of effective) {
		if (severity !== "enabled") {
			continue;
		}

		const name = translate ? translateRuleToOxlint(rule) : rule;
		if (name.startsWith("jsdoc/") || name.startsWith("jsdoc-js/")) {
			rules.add(name);
		}
	}

	return rules;
}

/**
 * Effective enabled jsdoc rule sets for both engines under the given options.
 *
 * @param options - Factory options to apply to both engines.
 * @returns The eslint and oxlint enabled jsdoc rule sets for `src/index.ts`.
 */
async function jsdocRuleSets(
	options: Record<string, unknown>,
): Promise<{ eslint: Set<string>; oxlint: Set<string> }> {
	const eslintOnly = [...(await isentinel({ name: "test/jsdoc-eslint", ...options }))];
	const oxlintConfig = oxlintIsentinel({ name: "test/jsdoc-oxlint", ...options });
	return {
		eslint: enabledJsdocRules(effectiveEslintRules(eslintOnly, "src/index.ts"), true),
		oxlint: enabledJsdocRules(effectiveOxlintRules(oxlintConfig, "src/index.ts"), false),
	};
}

describe("oxlint jsdoc parity", () => {
	// Variant coverage matters: the in-repo consumer uses neither jsdoc:full
	// nor package mode, so this asymmetry only surfaced on a real project.
	it("should enable the full jsdoc tier on both engines under jsdoc:full", async ({ expect }) => {
		expect.hasAssertions();

		const { eslint, oxlint } = await jsdocRuleSets({ ...baseOptions, jsdoc: { full: true } });

		expect(oxlint).toStrictEqual(eslint);
		expect(oxlint.has("jsdoc/require-param")).toBe(true);
		expect(oxlint.has("jsdoc/require-returns")).toBe(true);
		expect(oxlint.has("jsdoc-js/require-template")).toBe(true);
	});

	it("should omit the full jsdoc tier on both engines by default (game)", async ({ expect }) => {
		expect.hasAssertions();

		const { eslint, oxlint } = await jsdocRuleSets({ ...baseOptions });

		expect(oxlint).toStrictEqual(eslint);
		expect(oxlint.has("jsdoc/require-param")).toBe(false);
		expect(oxlint.has("jsdoc/require-returns")).toBe(false);
		expect(oxlint.has("jsdoc-js/require-template")).toBe(false);
	});
});

describe("oxlint jsPlugin type-awareness", () => {
	const jsPluginVariants: Array<Record<string, unknown>> = [
		{ ...baseOptions },
		{
			...baseOptions,
			eslintPlugin: true,
			react: true,
			roblox: false,
			test: { jest: true },
			type: "package",
			typescript: { erasableOnly: true },
		},
	];

	it("should never emit a jsPlugin rule that requires type information", async ({ expect }) => {
		expect.hasAssertions();

		const problems: Array<string> = [];
		for (const options of jsPluginVariants) {
			const config = oxlintIsentinel({ name: "test/type-aware", ...options });
			problems.push(...(await findTypeAwareEmissions(config)));
		}

		expect(problems).toStrictEqual([]);
	});

	it("should register a resolvable jsPlugin for every emitted prefixed rule", ({ expect }) => {
		expect.hasAssertions();

		expect(Object.keys(oxlintJsPlugins).length).toBeGreaterThan(20);

		for (const options of jsPluginVariants) {
			const config = oxlintIsentinel({ name: "test/js-plugin-prefixes", ...options });

			const registered = registeredJsPlugins(config);

			expect(registered.size).toBeGreaterThan(0);

			for (const [prefix, specifier] of registered) {
				const packageName = oxlintJsPlugins[prefix]!;

				expect(isPackageExists(packageName), `${packageName} should be installed`).toBe(
					true,
				);

				// Specifiers resolve to absolute URLs so oxlint does not
				// resolve them against the consumer's config file.
				expect(specifier, `${prefix} should be absolute`).toMatch(/^file:\/\//);
				expect(specifier).toContain(`/node_modules/${packageName}/`);
			}

			const knownPrefixes = new Set<string>([
				...(config.plugins! as Array<string>),
				...registered.keys(),
			]);

			expect(unresolvedPrefixedRules(config, knownPrefixes)).toStrictEqual([]);
		}
	});
});

/**
 * Collect the jsPlugin entries registered on a built oxlint config, keyed by
 * plugin name (rule prefix).
 *
 * @param config - The built oxlint config.
 * @returns Plugin name to package specifier.
 */
function registeredJsPlugins(config: OxlintConfig): Map<string, string> {
	const registered = new Map<string, string>();
	const entries = config.jsPlugins ?? [];
	for (const entry of entries) {
		if (typeof entry !== "string") {
			registered.set(entry.name, entry.specifier);
		}
	}

	return registered;
}

/**
 * Find rules emitted in overrides whose prefix is neither a native oxlint
 * plugin nor a registered jsPlugin — these would only fail at oxlint runtime.
 *
 * @param config - The built oxlint config.
 * @param knownPrefixes - Native plugin names plus registered jsPlugin names.
 * @returns Rule names with an unresolvable prefix.
 */
function unresolvedPrefixedRules(config: OxlintConfig, knownPrefixes: Set<string>): Array<string> {
	const unresolved = new Set<string>();
	const overrides = config.overrides ?? [];
	for (const override of overrides) {
		const ruleNames = Object.keys(override.rules ?? {});
		for (const rule of ruleNames) {
			const slashIndex = rule.indexOf("/");
			if (slashIndex !== -1 && !knownPrefixes.has(rule.slice(0, slashIndex))) {
				unresolved.add(rule);
			}
		}
	}

	return [...unresolved];
}
