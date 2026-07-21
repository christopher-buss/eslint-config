import { describe, expect, it } from "vitest";

import { isentinel } from "../src";
import type { TypedFlatConfigItem } from "../src";
import { isentinel as oxlintIsentinel } from "../src/oxlint";
import type { OxlintConfig } from "../src/oxlint";
import {
	isJsPluginRule,
	isOxlintCovered,
	oxlintJsPlugins,
	oxlintRuleMapping,
	translateRuleToOxlint,
} from "../src/rules/oxlint-mapping";
import { effectiveEslintRules, enabledFromEffective } from "./oxlint-helpers";

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
} as const;

/**
 * Add every enabled rule from a rule map to the given set.
 *
 * @param rules - The rule map to scan.
 * @param enabled - The set collecting enabled rule names.
 */
function collectEnabledRules(
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
 * Collect the rule names enabled anywhere in the resolved ESLint configs,
 * ignoring the Markdown-code siblings hybrid mode synthesizes so the drop is
 * visible.
 *
 * @param configs - The resolved flat config items.
 * @returns The enabled rule names.
 */
function enabledEslintRules(configs: Array<TypedFlatConfigItem>): Set<string> {
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
 * Collect the rule names enabled anywhere in a generated oxlint config.
 *
 * @param config - The generated oxlint config.
 * @returns The enabled rule names.
 */
function enabledOxlintRules(config: OxlintConfig): Set<string> {
	const enabled = new Set<string>();

	collectEnabledRules(config.rules, enabled);
	const overrides = config.overrides ?? [];
	for (const override of overrides) {
		collectEnabledRules(override.rules, enabled);
	}

	return enabled;
}

async function eslintRules(options: Record<string, unknown>): Promise<Set<string>> {
	const composer = await isentinel({ name: "test/native-only", ...baseOptions, ...options });
	return enabledEslintRules([...composer]);
}

function nativeOnlyOxlintConfig(): OxlintConfig {
	return oxlintIsentinel({ name: "test/oxlint-native-only", ...baseOptions, jsPlugins: false });
}

/**
 * Whether an oxlint-side rule name belongs to a plugin oxlint can only load as
 * a jsPlugin.
 *
 * @param rule - The oxlint-side rule name.
 * @returns Whether the rule needs a jsPlugin.
 */
function needsJsPlugin(rule: string): boolean {
	return Object.keys(oxlintJsPlugins).some((prefix) => rule.startsWith(`${prefix}/`));
}

/**
 * Whether a rule dropped from ESLint is one native-only mode may drop: it must
 * be mapped, and not a jsPlugin rule.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether the drop is unexpected.
 */
function isWrongDropTarget(rule: string): boolean {
	return isJsPluginRule(rule) || !isOxlintCovered(rule);
}

describe("oxlint native-only hybrid mode", () => {
	it("should load no jsPlugins when jsPlugins is false", () => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/oxlint-native-only",
			...baseOptions,
			jsPlugins: false,
			react: true,
			test: { jest: true },
		});

		expect(config.jsPlugins).toStrictEqual([]);

		const jsPluginRules = [...enabledOxlintRules(config)].filter((rule) => needsJsPlugin(rule));

		expect(jsPluginRules).toStrictEqual([]);
	});

	it("should keep jsPlugin-mapped rules in ESLint", async () => {
		expect.hasAssertions();

		const eslintOnly = await eslintRules({});
		const full = await eslintRules({ oxlint: true });
		const native = await eslintRules({ oxlint: "native" });

		const jsPluginRules = [...eslintOnly].filter((rule) => isJsPluginRule(rule));

		// The mode only means something if the mapping has jsPlugin rules the
		// full hand-off moves out of ESLint.
		expect(jsPluginRules.length).toBeGreaterThan(10);

		const movedInFullMode = jsPluginRules.filter((rule) => !full.has(rule));

		expect(movedInFullMode).toStrictEqual(jsPluginRules);

		const movedInNativeMode = jsPluginRules.filter((rule) => !native.has(rule));

		expect(movedInNativeMode).toStrictEqual([]);
	});

	it("should still hand the native rules to oxlint", async () => {
		expect.hasAssertions();

		const eslintOnly = await eslintRules({});
		const native = await eslintRules({ oxlint: "native" });
		const dropped = [...eslintOnly].filter((rule) => !native.has(rule));

		expect(dropped.length).toBeGreaterThan(100);

		const wrongTarget = dropped.filter((rule) => isWrongDropTarget(rule));

		expect(wrongTarget).toStrictEqual([]);

		const oxlintEnabled = enabledOxlintRules(nativeOnlyOxlintConfig());
		const missing = dropped.filter((rule) => !oxlintEnabled.has(translateRuleToOxlint(rule)));

		expect(missing).toStrictEqual([]);
	});

	it("should keep formatting of real TS files in ESLint", async () => {
		expect.hasAssertions();

		// Full hybrid leaves real JS/TS files to oxlint's oxfmt jsPlugin and
		// only formats Markdown code blocks; native-only loads no jsPlugin, so
		// ESLint must format the source files itself.
		const full = await isentinel({ name: "test/fmt-full", ...baseOptions, oxlint: true });
		const native = await isentinel({
			name: "test/fmt-native",
			...baseOptions,
			oxlint: "native",
		});

		const sourcePath = "src/index.ts";
		const fullRules = enabledFromEffective(effectiveEslintRules([...full], sourcePath));
		const nativeRules = enabledFromEffective(effectiveEslintRules([...native], sourcePath));

		expect(fullRules.has("oxfmt/oxfmt")).toBe(false);
		expect(nativeRules.has("oxfmt/oxfmt")).toBe(true);
	});

	it("should stamp the hybrid marker", async () => {
		expect.hasAssertions();

		const composer = await isentinel({
			name: "test/native-only-marker",
			...baseOptions,
			oxlint: "native",
		});
		const marked = [...composer].some(
			(config) => config.settings?.["isentinel/oxlint"] === true,
		);

		expect(marked).toBe(true);
	});

	it("should lose no rule across the two engines", async () => {
		expect.hasAssertions();

		const eslintOnly = await eslintRules({});
		const native = await eslintRules({ oxlint: "native" });
		const oxlintEnabled = enabledOxlintRules(nativeOnlyOxlintConfig());

		function handledByOxlint(rule: string): boolean {
			return oxlintEnabled.has(translateRuleToOxlint(rule));
		}

		const lost = [...eslintOnly]
			.filter((rule) => !native.has(rule))
			.filter((rule) => !handledByOxlint(rule));

		expect(lost).toStrictEqual([]);
	});

	it("should not double-lint a rule in both engines", async () => {
		expect.hasAssertions();

		const native = await eslintRules({ oxlint: "native" });
		const oxlintEnabled = enabledOxlintRules(nativeOnlyOxlintConfig());

		const shared = [...native]
			.filter((rule) => oxlintRuleMapping[rule] !== undefined)
			.filter((rule) => oxlintEnabled.has(translateRuleToOxlint(rule)));

		expect(shared).toStrictEqual([]);
	});
});
