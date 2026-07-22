import { describe, expect, it } from "vitest";

import { isentinel } from "../src/index.ts";
import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import type { OxlintConfig } from "../src/oxlint/index.ts";
import { jsPluginKey } from "../src/oxlint/utils.ts";
import {
	isJsPluginRule,
	isOxlintCovered,
	oxlintRuleMapping,
	translateRuleToOxlint,
} from "../src/rules/oxlint-mapping.ts";
import {
	effectiveEslintRules,
	enabledEslintRules,
	enabledFromEffective,
	enabledOxlintRules,
} from "./oxlint-helpers.ts";

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
} as const;

async function eslintRules(options: Record<string, unknown>): Promise<Set<string>> {
	const composer = await isentinel({ name: "test/native-only", ...baseOptions, ...options });
	return enabledEslintRules([...composer]);
}

function nativeOnlyOxlintConfig(): OxlintConfig {
	return oxlintIsentinel({ name: "test/oxlint-native-only", ...baseOptions, jsPlugins: false });
}

/**
 * The enabled rules of a generated config whose plugin prefix the config does
 * not register. Oxlint fails the whole config build on any of these.
 *
 * @param config - The generated oxlint config.
 * @returns The offending rule names.
 */
function unregisteredRules(config: OxlintConfig): Array<string> {
	const registered = new Set<string>([
		...(config.plugins ?? []),
		...(config.jsPlugins ?? []).map((entry) => jsPluginKey(entry)),
	]);
	return [...enabledOxlintRules(config)].filter((rule) => {
		const slashIndex = rule.indexOf("/");
		return slashIndex !== -1 && !registered.has(rule.slice(0, slashIndex));
	});
}

/**
 * Whether native-only mode must NOT drop this rule from ESLint: only mapped,
 * non-jsPlugin rules move to oxlint.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether dropping the rule would be a coverage loss.
 */
function mustStayInEslint(rule: string): boolean {
	return isJsPluginRule(rule) || !isOxlintCovered(rule);
}

describe("oxlint native-only hybrid mode", () => {
	it("should load only the directive jsPlugin when jsPlugins is false", () => {
		expect.hasAssertions();

		const config = oxlintIsentinel({
			name: "test/oxlint-native-only",
			...baseOptions,
			jsPlugins: false,
			react: true,
			// `options.rules` goes through the same splitter as the preset
			// fragments, so it is the other way a jsPlugin could sneak back in.
			rules: { "perfectionist/sort-objects": "error", "sonar/cognitive-complexity": "off" },
			test: { jest: true },
		});

		// `oxlint-comments` is the documented exception: it lints the
		// `oxlint-disable` directives that native rules still need, and ESLint
		// cannot run it (its rules use oxlint's `createOnce` API).
		expect(config.jsPlugins?.map((entry) => jsPluginKey(entry))).toStrictEqual([
			"oxlint-comments",
		]);

		// Every rule left must belong to a plugin the config still registers —
		// oxlint fails the whole build otherwise.
		expect(unregisteredRules(config)).toStrictEqual([]);
	});

	it("should keep the oxlint-comments rules enabled in native-only mode", () => {
		expect.hasAssertions();

		const enabled = enabledOxlintRules(nativeOnlyOxlintConfig());
		const directiveRules = [...enabled].filter((rule) => rule.startsWith("oxlint-comments/"));

		expect(directiveRules).toContain("oxlint-comments/require-description");
		expect(directiveRules.length).toBeGreaterThan(3);
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

		// Only mapped, non-jsPlugin rules may leave ESLint in this mode...
		const wrongTarget = dropped.filter((rule) => mustStayInEslint(rule));

		expect(wrongTarget).toStrictEqual([]);

		// ...and each one must be enabled in the oxlint config, or it runs in
		// neither engine.
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
