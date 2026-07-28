import { describe, it } from "vitest";

import { jsPluginRuleNames } from "../src/generated/oxlint-capabilities.ts";
import { isentinel } from "../src/index.ts";
import { jsPluginAdapterFor } from "../src/oxlint/adapters.ts";
import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import { resolveOxlintRule, translateRuleToOxlint } from "../src/oxlint/routing.ts";
import { splitOxlintRules } from "../src/oxlint/utils.ts";
import { effectiveOxlintRules, enabledEslintRules, enabledOxlintRules } from "./oxlint-helpers.ts";

// Rules the preset only ever disables, which capability detection nonetheless
// recognizes. Two per route kind is enough: the assertions below are about the
// property each kind must satisfy, not about how many rules happen to be in
// this state at a given plugin version.
const OFF_ONLY_NATIVE_RULES = ["getter-return", "no-unused-vars", "ts/no-explicit-any"] as const;
const OFF_ONLY_JS_PLUGIN_RULES = [
	"eslint-plugin/meta-property-ordering",
	"jsdoc/sort-tags",
	"sonar/no-commented-code",
] as const;

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
} as const;

describe("generated Oxlint routing", () => {
	// The generated capabilities store rule names only; the oxlint name, plugin
	// alias and package specifier are derived. That is only sound while every
	// generated rule name has an adapter, which breaks the moment a prefix is
	// added to `oxlintJsPlugins` without a matching rename entry.
	it("derives an adapter for every generated jsPlugin rule", ({ expect }) => {
		expect.assertions(1);

		const orphaned = [...jsPluginRuleNames].filter(
			(rule) => jsPluginAdapterFor(rule) === undefined,
		);

		expect(orphaned).toStrictEqual([]);
	});

	it("applies resolver precedence and aliases", ({ expect }) => {
		expect.assertions(8);

		expect(resolveOxlintRule("sonar/no-all-duplicated-branches")).toMatchObject({
			kind: "native",
			oxlintName: "oxc/branches-sharing-code",
		});
		expect(resolveOxlintRule("sonar/no-ignored-return")).toMatchObject({
			kind: "eslint-only",
		});
		expect(resolveOxlintRule("unicorn/no-lonely-if")).toStrictEqual({
			kind: "js-plugin",
			oxlintName: "unicorn-js/no-lonely-if",
			pluginAlias: "unicorn-js",
			specifier: "eslint-plugin-unicorn",
			suppressedNativeName: "unicorn/no-lonely-if",
		});
		expect(resolveOxlintRule("react/rules-of-hooks")).toMatchObject({
			kind: "js-plugin",
			suppressedNativeName: "react/rules-of-hooks",
		});
		expect(resolveOxlintRule("vitest/valid-title")).toMatchObject({
			kind: "native",
			oxlintName: "vitest/valid-title",
		});
		expect(resolveOxlintRule("ts/no-unused-vars")).toMatchObject({
			kind: "js-plugin",
			oxlintName: "ts/no-unused-vars",
		});
		expect(resolveOxlintRule("local/custom-rule")).toStrictEqual({ kind: "unmanaged" });
		expect(translateRuleToOxlint("jest/unbound-method")).toBe("jest-js/unbound-method");
	});

	// Categories can only ever switch native rules back on, so a rule the preset
	// deliberately disables has to reach the config as an explicit "off" or a
	// consumer setting `categories` would silently get it back. Native rules
	// need no plugin, so pinning them costs nothing.
	it("pins off-only native capabilities so categories cannot revive them", ({ expect }) => {
		expect.assertions(1);

		const emitted = OFF_ONLY_NATIVE_RULES.map((rule) => {
			const split = splitOxlintRules({ [rule]: "off" });
			return {
				jsPluginRules: Object.keys(split.jsPluginRules),
				kind: resolveOxlintRule(rule).kind,
				nativeSeverity: split.nativeRules[translateRuleToOxlint(rule)],
				rule,
			};
		});

		expect(emitted).toStrictEqual(
			OFF_ONLY_NATIVE_RULES.map((rule) => {
				return {
					jsPluginRules: [],
					kind: "native",
					nativeSeverity: "off",
					rule,
				};
			}),
		);
	});

	// The jsPlugin side is the opposite trade: emitting the entry would load a
	// whole plugin to carry a disable that changes nothing, since jsPlugin rules
	// are off until something enables them.
	it("drops off-only jsPlugin capabilities rather than loading their plugin", ({ expect }) => {
		expect.assertions(1);

		const emitted = OFF_ONLY_JS_PLUGIN_RULES.map((rule) => {
			const split = splitOxlintRules({ [rule]: "off" });
			return {
				jsPluginRules: Object.keys(split.jsPluginRules),
				jsPlugins: split.jsPlugins,
				kind: resolveOxlintRule(rule).kind,
				nativeRules: Object.keys(split.nativeRules),
				rule,
			};
		});

		expect(emitted).toStrictEqual(
			OFF_ONLY_JS_PLUGIN_RULES.map((rule) => {
				return {
					jsPluginRules: [],
					jsPlugins: [],
					kind: "js-plugin",
					nativeRules: [],
					rule,
				};
			}),
		);
	});

	it("keeps an explicit user disable authoritative", ({ expect }) => {
		expect.assertions(2);

		const split = splitOxlintRules(
			{ "ts/no-unused-vars": "off" },
			{ overrides: new Set(["ts/no-unused-vars"]) },
		);

		expect(split.jsPluginRules["ts/no-unused-vars"]).toBe("off");
		expect(split.jsPlugins).toHaveLength(1);
	});

	it("moves newly owned enabled rules in full hybrid mode", async ({ expect }) => {
		expect.assertions(1);

		const options = {
			...baseOptions,
			eslintPlugin: true,
			react: true,
			roblox: false,
			type: "package" as const,
		};
		const eslintOnly = enabledEslintRules([
			...(await isentinel({ name: "test/routing-eslint", ...options })),
		]);
		const hybrid = enabledEslintRules([
			...(await isentinel({ name: "test/routing-hybrid", ...options, oxlint: true })),
		]);
		const oxlint = enabledOxlintRules(
			oxlintIsentinel({ name: "test/routing-oxlint", ...options }),
		);

		const newlyOwnedRules = [
			"eslint-plugin/require-meta-languages",
			"flawless/react-namespace",
		];
		const handOff = newlyOwnedRules.map((rule) => {
			return {
				inEslintOnly: eslintOnly.has(rule),
				inHybrid: hybrid.has(rule),
				inOxlint: oxlint.has(translateRuleToOxlint(rule)),
				rule,
			};
		});

		expect(handOff).toStrictEqual(
			newlyOwnedRules.map((rule) => {
				return {
					inEslintOnly: true,
					inHybrid: false,
					inOxlint: true,
					rule,
				};
			}),
		);
	});

	it("suppresses JS-preferred native counterparts in full and native-only modes", ({
		expect,
	}) => {
		expect.assertions(4);

		const full = effectiveOxlintRules(
			oxlintIsentinel({ name: "test/routing-full", ...baseOptions }),
			"src/index.ts",
		);
		const nativeOnly = effectiveOxlintRules(
			oxlintIsentinel({
				name: "test/routing-native",
				...baseOptions,
				jsPlugins: false,
			}),
			"src/index.ts",
		);

		expect(full.get("unicorn-js/no-lonely-if")).toBe("enabled");
		expect(full.get("unicorn/no-lonely-if")).toBe("off");
		expect(nativeOnly.has("unicorn-js/no-lonely-if")).toBe(false);
		expect(nativeOnly.get("unicorn/no-lonely-if")).toBe("off");
	});
});
