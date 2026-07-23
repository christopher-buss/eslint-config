import { describe, it } from "vitest";

import { dropOxlintCoveredRules } from "../src/eslint/oxlint-drop.ts";
import type { TypedFlatConfigItem } from "../src/eslint/types.ts";
import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import type { OxlintConfig } from "../src/oxlint/index.ts";

function typeAwareRulesConfig(): TypedFlatConfigItem {
	return {
		name: "isentinel/typescript/rules-type-aware",
		files: ["**/*.ts"],
		ignores: ["**/*.md/**"],
		rules: {
			"no-console": "error",
			"ts/no-floating-promises": "error",
		},
	};
}

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
} as const;

function allRuleNames(config: OxlintConfig): Set<string> {
	const names = new Set<string>();
	const topLevelRules = Object.keys(config.rules ?? {});
	for (const rule of topLevelRules) {
		names.add(rule);
	}

	const overrides = config.overrides ?? [];
	for (const override of overrides) {
		const overrideRules = Object.keys(override.rules ?? {});
		for (const rule of overrideRules) {
			names.add(rule);
		}
	}

	return names;
}

describe("oxlint tsgolint gating", () => {
	it("should emit tsgolint rules when type-aware is enabled", ({ expect }) => {
		expect.assertions(2);

		const config = oxlintIsentinel({
			name: "test/type-aware-on",
			...baseOptions,
			options: { typeAware: true },
		});

		expect(config.options?.typeAware).toBe(true);
		expect(allRuleNames(config).has("typescript/no-floating-promises")).toBe(true);
	});

	it("should drop tsgolint rules but keep native rules when type-aware is disabled", ({
		expect,
	}) => {
		expect.assertions(3);

		const config = oxlintIsentinel({
			name: "test/type-aware-off",
			...baseOptions,
			options: { typeAware: false },
		});
		const names = allRuleNames(config);

		expect(config.options?.typeAware).toBe(false);
		expect(names.has("typescript/no-floating-promises")).toBe(false);
		expect(names.has("typescript/consistent-type-assertions")).toBe(true);
	});
});

describe("hybrid tsgolint drop gating", () => {
	it("should keep tsgolint rules in ESLint when oxlint-tsgolint is absent", ({ expect }) => {
		expect.assertions(2);

		const configs = [typeAwareRulesConfig()];
		dropOxlintCoveredRules(configs, false);

		expect(configs[0]?.rules?.["ts/no-floating-promises"]).toBe("error");
		expect(configs[0]?.rules?.["no-console"]).toBeUndefined();
	});

	it("should drop tsgolint rules from ESLint when oxlint-tsgolint is present", ({ expect }) => {
		expect.assertions(1);

		const configs = [typeAwareRulesConfig()];
		dropOxlintCoveredRules(configs, true);

		expect(configs[0]?.rules?.["ts/no-floating-promises"]).toBeUndefined();
	});
});
