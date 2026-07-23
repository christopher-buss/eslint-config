import process from "node:process";
import { describe, it } from "vitest";

import { isRecord } from "../src/guards.ts";
import { isentinel } from "../src/index.ts";
import type { TypedFlatConfigItem } from "../src/index.ts";
import type { Severity } from "./oxlint-helpers.ts";
import { effectiveEslintRules } from "./oxlint-helpers.ts";

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
 * Every plugin prefix registered anywhere in the configs.
 *
 * @param configs - The resolved flat config items.
 * @returns The registered plugin prefixes.
 */
function registeredPlugins(configs: Array<TypedFlatConfigItem>): Set<string> {
	const plugins = new Set<string>();

	for (const config of configs) {
		const prefixes = Object.keys(config.plugins ?? {});
		for (const prefix of prefixes) {
			plugins.add(prefix);
		}
	}

	return plugins;
}

/**
 * The plugin prefixes of every rule enabled for a TS source file. These are the
 * prefixes a disable comment in that file can name, so both passes have to
 * resolve them.
 *
 * @param configs - The resolved flat config items.
 * @param filePath - The source file to resolve for.
 * @returns The plugin prefixes in play for that file.
 */
function pluginsUsedForFile(configs: Array<TypedFlatConfigItem>, filePath: string): Set<string> {
	const prefixes = new Set<string>();

	const effective = effectiveEslintRules(configs, filePath);
	for (const [rule, severity] of effective) {
		const slashIndex = rule.lastIndexOf("/");
		if (severity === "enabled" && slashIndex !== -1) {
			prefixes.add(rule.slice(0, slashIndex));
		}
	}

	return prefixes;
}

/**
 * Whether a config item targets something other than plain JS or TS, meaning
 * it carries a processor or declares its own language.
 *
 * @param config - The resolved flat config item.
 * @returns Whether the config item is for a non-JS/TS language.
 */
function hasNonJsLanguage(config: TypedFlatConfigItem): boolean {
	return config.processor !== undefined || "language" in config;
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
function collectRuleRegistry(configs: Array<TypedFlatConfigItem>): Map<string, unknown> {
	const registry = new Map<string, unknown>();
	for (const config of configs) {
		const plugins = Object.entries(config.plugins ?? {});
		for (const [prefix, plugin] of plugins) {
			const rules = isRecord(plugin) && isRecord(plugin["rules"]) ? plugin["rules"] : {};
			for (const [name, rule] of Object.entries(rules)) {
				registry.set(`${prefix}/${name}`, rule);
			}
		}
	}

	return registry;
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
 * Find the enabled rules of a config item whose metadata says they require
 * type checking.
 *
 * @param config - The flat config item to scan.
 * @param registry - Rule id to rule definition.
 * @returns Human-readable problems.
 */
function findTypeCheckedRules(
	config: TypedFlatConfigItem,
	registry: Map<string, unknown>,
): Array<string> {
	const problems: Array<string> = [];
	const entries = Object.entries(config.rules ?? {});
	for (const [rule, value] of entries) {
		const severity = Array.isArray(value) ? value[0] : value;
		if (value === undefined || severity === "off" || severity === 0) {
			continue;
		}

		if (ruleRequiresTypeChecking(registry.get(rule))) {
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
	const parserOptions = config.languageOptions?.["parserOptions"];
	const projectService = isRecord(parserOptions) ? parserOptions["projectService"] : undefined;
	return projectService !== undefined && projectService !== false;
}

describe("type-aware split", () => {
	describe.for(variants)("$name", (variant: SplitVariant) => {
		it("should partition effective severities exactly", async ({ expect }) => {
			expect.assertions(1);

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
			expect.assertions(2);

			const { fast, slow } = await buildSplitConfigs(variant.options);

			expect(fast.filter(enablesProjectService)).toStrictEqual([]);
			expect(slow.some(enablesProjectService)).toBe(true);
		});

		it("should keep rules that require type checking out of the fast pass", async ({
			expect,
		}) => {
			expect.assertions(1);

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
			expect.assertions(3);

			const { slow } = await buildSplitConfigs(variant.options);

			const withOtherLanguages = slow.filter(hasNonJsLanguage);

			expect(withOtherLanguages).toStrictEqual([]);

			// Non-JS/TS files must be globally ignored: surviving rule configs
			// (for example user blocks scoping rules off for JSON files) would
			// otherwise pull them into the run without a matching parser.
			const globalIgnores = slow.find(
				(config) => config.name === "isentinel/type-aware-split/ignores",
			);

			expect(globalIgnores?.ignores).toContain("**/*.json{,5,c}");
			expect(globalIgnores?.ignores).toContain("**/*.y{,a}ml");
		});

		it("should silence unused disable directives in both passes", async ({ expect }) => {
			expect.assertions(3);

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

	it("should classify rules listed in typeAwareRules as type-aware", async ({ expect }) => {
		expect.assertions(2);

		const options = { ...baseOptions, typeAwareRules: ["no-console"] };
		const [fast, slow] = await Promise.all([
			isentinel({ name: "test/split-extra-fast", ...options, typeAware: false }),
			isentinel({ name: "test/split-extra-slow", ...options, typeAware: "only" }),
		]);

		const fastEffective = effectiveEslintRules([...fast], "src/services/service.ts");
		const slowEffective = effectiveEslintRules([...slow], "src/services/service.ts");

		expect(fastEffective.has("no-console")).toBe(false);
		expect(slowEffective.has("no-console")).toBe(true);
	});

	it("should register every JS/TS plugin in both passes", async ({ expect }) => {
		expect.assertions(1);

		// A rule name only resolves in a pass whose configs registered its
		// plugin, so a module targeting JS/TS files that is composed in one
		// pass but not the other makes an `eslint-disable` for its rules fail
		// that pass with "Definition for rule was not found". Modules for other
		// languages are exempt: the "only" pass ignores their files outright.
		const { full, slow } = await buildSplitConfigs(baseOptions);
		const registeredInSlow = registeredPlugins(slow);
		const missing = [...pluginsUsedForFile(full, "src/index.ts")].filter(
			(plugin) => !registeredInSlow.has(plugin),
		);

		expect(missing).toStrictEqual([]);
	});

	it("should reject typeAware 'only' without type-aware linting", async ({ expect }) => {
		expect.assertions(1);

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

type SplitOutcome = "full" | "off" | "only";

interface EnvironmentCase {
	env: string | undefined;
	expected: SplitOutcome;
	option: "only" | boolean | undefined;
}

/**
 * Classify a resolved config by which type-aware split (if any) was applied.
 * The split appends a `type-aware-split/disables` config, and the `"only"` pass
 * additionally appends a `type-aware-split/ignores` config.
 *
 * @param configs - The resolved flat config items.
 * @returns The observed split outcome.
 */
function classifySplit(configs: Array<TypedFlatConfigItem>): SplitOutcome {
	const names = new Set(configs.map((config) => config.name));
	if (!names.has("isentinel/type-aware-split/disables")) {
		return "full";
	}

	return names.has("isentinel/type-aware-split/ignores") ? "only" : "off";
}

/**
 * Build a config with `ESLINT_TYPE_AWARE` set to the given value (restoring it
 * afterwards) and report which split it produced.
 *
 * @param environmentValue - The value to assign the env var, or `undefined` to
 *   leave it unset.
 * @param option - The `typeAware` factory option, or `undefined` to omit it.
 * @returns The observed split outcome.
 */
async function resolveSplitOutcome(
	environmentValue: string | undefined,
	option: "only" | boolean | undefined,
): Promise<SplitOutcome> {
	const previous = process.env["ESLINT_TYPE_AWARE"];
	if (environmentValue === undefined) {
		delete process.env["ESLINT_TYPE_AWARE"];
	} else {
		process.env["ESLINT_TYPE_AWARE"] = environmentValue;
	}

	const optionOverride = option === undefined ? {} : { typeAware: option };

	try {
		const config = await isentinel({
			name: "test/env-type-aware",
			...baseOptions,
			...optionOverride,
		});
		return classifySplit([...config]);
	} finally {
		if (previous === undefined) {
			delete process.env["ESLINT_TYPE_AWARE"];
		} else {
			process.env["ESLINT_TYPE_AWARE"] = previous;
		}
	}
}

// Precedence matrix: env off/false/only/garbage/unset crossed with the
// `typeAware` option undefined/false/"only"/true. An explicit option always
// wins; the env var only applies when the option is undefined.
const environmentCases: Array<EnvironmentCase> = [
	{ env: "off", expected: "off", option: undefined },
	{ env: "false", expected: "off", option: undefined },
	{ env: "only", expected: "only", option: undefined },
	{ env: "garbage", expected: "full", option: undefined },
	{ env: undefined, expected: "full", option: undefined },
	{ env: "only", expected: "off", option: false },
	{ env: "off", expected: "only", option: "only" },
	{ env: "garbage", expected: "off", option: false },
	{ env: undefined, expected: "only", option: "only" },
	{ env: "off", expected: "full", option: true },
];

describe("eslint_type_aware environment variable", () => {
	it.for(environmentCases)(
		"env=$env option=$option -> $expected",
		async ({ env, expected, option }, { expect }) => {
			expect.assertions(1);

			expect(await resolveSplitOutcome(env, option)).toBe(expected);
		},
	);
});
