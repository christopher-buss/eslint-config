import { describe, it } from "vitest";

import { isentinel } from "../src";
import type { TypedFlatConfigItem } from "../src";
import type { Severity } from "./oxlint-helpers";
import { effectiveEslintRules } from "./oxlint-helpers";

interface PluginRuleMeta {
	meta?: { docs?: Record<string, unknown> };
}

interface SplitVariant {
	name: string;
	files: Array<string>;
	options: Record<string, unknown>;
}

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
} as const;

const variants: Array<SplitVariant> = [
	{
		name: "roblox-game",
		files: [
			"src/services/service.ts",
			"src/components/component.tsx",
			"src/util.js",
			"src/types/env.d.ts",
			"scripts/build.ts",
			".github/workflows/ci.yaml",
			"package.json",
		],
		options: { ...baseOptions },
	},
	{
		name: "package",
		files: ["src/index.ts", "src/utilities/helper.ts", "src/index.spec.ts", "build.config.ts"],
		options: {
			...baseOptions,
			eslintPlugin: true,
			naming: true,
			roblox: false,
			test: { vitest: true },
			type: "package",
		},
	},
	{
		name: "react-jest",
		files: ["src/components/component.tsx", "src/services/service.spec.ts"],
		options: { ...baseOptions, react: true, test: { jest: true } },
	},
	{
		name: "hybrid",
		files: ["src/services/service.ts", "src/components/component.tsx", "src/util.js"],
		options: { ...baseOptions, oxlint: true },
	},
];

/**
 * Build the full, non-type-aware and type-aware-only configs for a variant.
 *
 * @param options - Factory options shared by the three configs.
 * @returns The three resolved config arrays.
 */
async function buildSplitConfigs(options: Record<string, unknown>): Promise<{
	fast: Array<TypedFlatConfigItem>;
	full: Array<TypedFlatConfigItem>;
	slow: Array<TypedFlatConfigItem>;
}> {
	const [full, fast, slow] = await Promise.all([
		isentinel({ name: "test/split-full", ...options }),
		isentinel({ name: "test/split-fast", ...options, typeAware: false }),
		isentinel({ name: "test/split-slow", ...options, typeAware: "only" }),
	]);
	return { fast: [...fast], full: [...full], slow: [...slow] };
}

/**
 * Compare the merged effective severities of both split passes against the
 * full config for one file.
 *
 * @param filePath - The file path under comparison.
 * @param full - Effective severities of the full config.
 * @param fast - Effective severities of the non-type-aware pass.
 * @param slow - Effective severities of the type-aware-only pass.
 * @returns Human-readable problems.
 */
function findPartitionProblems(
	filePath: string,
	full: Map<string, Severity>,
	fast: Map<string, Severity>,
	slow: Map<string, Severity>,
): Array<string> {
	const problems: Array<string> = [];

	for (const rule of fast.keys()) {
		if (slow.has(rule)) {
			problems.push(`${filePath}: ${rule} appears in both passes`);
		}
	}

	const merged = new Map([...fast, ...slow]);
	for (const [rule, severity] of full) {
		if (merged.get(rule) !== severity) {
			problems.push(
				`${filePath}: ${rule} full=${severity} merged=${merged.get(rule) ?? "absent"}`,
			);
		}
	}

	for (const rule of merged.keys()) {
		if (!full.has(rule)) {
			problems.push(`${filePath}: ${rule} not present in the full config`);
		}
	}

	return problems;
}

/**
 * Collect the rule definitions registered on the given configs, keyed by the
 * renamed `prefix/name` rule id.
 *
 * @param configs - The resolved flat config items.
 * @returns Rule id to rule definition.
 */
function collectRuleRegistry(configs: Array<TypedFlatConfigItem>): Map<string, PluginRuleMeta> {
	const registry = new Map<string, PluginRuleMeta>();
	for (const config of configs) {
		const plugins = Object.entries(config.plugins ?? {});
		for (const [prefix, plugin] of plugins) {
			const ruleEntries = Object.entries(
				(plugin as { rules?: Record<string, PluginRuleMeta> }).rules ?? {},
			);
			for (const [name, rule] of ruleEntries) {
				registry.set(`${prefix}/${name}`, rule);
			}
		}
	}

	return registry;
}

/**
 * Find the enabled rules of a config item whose metadata says they require
 * type checking.
 *
 * @param config - The flat config item to scan.
 * @param registry - Rule id to rule definition.
 * @returns Human-readable problems.
 */
function findTypeCheckedRules(
	config: TypedFlatConfigItem,
	registry: Map<string, PluginRuleMeta>,
): Array<string> {
	const problems: Array<string> = [];
	const entries = Object.entries(config.rules ?? {});
	for (const [rule, value] of entries) {
		const severity = Array.isArray(value) ? value[0] : value;
		if (value === undefined || severity === "off" || severity === 0) {
			continue;
		}

		if (registry.get(rule)?.meta?.docs?.["requiresTypeChecking"] === true) {
			problems.push(`${rule} in ${config.name ?? "unnamed config"}`);
		}
	}

	return problems;
}

/**
 * Whether a config item enables `projectService` (builds a TS program).
 *
 * @param config - The flat config item.
 * @returns Whether the config enables the project service.
 */
function enablesProjectService(config: TypedFlatConfigItem): boolean {
	const parserOptions = config.languageOptions?.["parserOptions"] as
		| Record<string, unknown>
		| undefined;
	const projectService = parserOptions?.["projectService"];
	return projectService !== undefined && projectService !== false;
}

describe("type-aware split", () => {
	describe.for(variants)("$name", (variant: SplitVariant) => {
		it("should partition effective severities exactly", async ({ expect }) => {
			expect.hasAssertions();

			const { fast, full, slow } = await buildSplitConfigs(variant.options);

			const problems: Array<string> = [];
			for (const filePath of variant.files) {
				problems.push(
					...findPartitionProblems(
						filePath,
						effectiveEslintRules(full, filePath),
						effectiveEslintRules(fast, filePath),
						effectiveEslintRules(slow, filePath),
					),
				);
			}

			expect(problems).toStrictEqual([]);
		});

		it("should never build a TS program in the non-type-aware pass", async ({ expect }) => {
			expect.hasAssertions();

			const { fast, slow } = await buildSplitConfigs(variant.options);

			expect(fast.filter(enablesProjectService)).toStrictEqual([]);
			expect(slow.some(enablesProjectService)).toBe(true);
		});

		it("should keep rules that require type checking out of the fast pass", async ({
			expect,
		}) => {
			expect.hasAssertions();

			const { fast } = await buildSplitConfigs(variant.options);
			const registry = collectRuleRegistry(fast);

			const problems: Array<string> = [];
			for (const config of fast) {
				problems.push(...findTypeCheckedRules(config, registry));
			}

			expect(problems).toStrictEqual([]);
		});

		it("should drop non-JS/TS-language configs in the type-aware-only pass", async ({
			expect,
		}) => {
			expect.hasAssertions();

			const { slow } = await buildSplitConfigs(variant.options);

			const withOtherLanguages = slow.filter(
				(config) => config.processor !== undefined || "language" in config,
			);

			expect(withOtherLanguages).toStrictEqual([]);
		});

		it("should silence unused disable directives in both passes", async ({ expect }) => {
			expect.hasAssertions();

			const { fast, full, slow } = await buildSplitConfigs(variant.options);

			expect(fast.at(-1)?.linterOptions?.reportUnusedDisableDirectives).toBe("off");
			expect(slow.at(-1)?.linterOptions?.reportUnusedDisableDirectives).toBe("off");
			expect(
				full.some(
					(config) => config.linterOptions?.reportUnusedDisableDirectives === "off",
				),
			).toBe(false);
		});
	});

	it("should reject typeAware 'only' without type-aware linting", async ({ expect }) => {
		expect.hasAssertions();

		await expect(
			isentinel({
				name: "test/split-guard",
				...baseOptions,
				typeAware: "only",
				typescript: { typeAware: false },
			}),
		).rejects.toThrow('typeAware: "only"');
	});
});
