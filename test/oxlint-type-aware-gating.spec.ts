import { describe, it } from "vitest";

import { isentinel as oxlintIsentinel } from "../src/oxlint";
import type { OxlintConfig } from "../src/oxlint";

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
		expect.hasAssertions();

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
		expect.hasAssertions();

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
