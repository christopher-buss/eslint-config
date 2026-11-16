import { describe, it, vi } from "vitest";

import { isentinel } from "../src/index.ts";
import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import { hasTypeAwareBackend } from "../src/utils.ts";

const installed = vi.hoisted(() => new Set<string>());

vi.mock(import("local-pkg"), async (importOriginal) => {
	const actual = await importOriginal();
	const backends = new Set(["oxlint-tsgolint", "tsrs"]);
	return {
		...actual,
		isPackageExists: (name: string, options?: Parameters<typeof actual.isPackageExists>[1]) => {
			return backends.has(name) ? installed.has(name) : actual.isPackageExists(name, options);
		},
	};
});

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
	spellCheck: false,
} as const;

const MISSING_BACKEND = "no type-aware oxlint backend is installed";

function install(...packages: Array<string>): void {
	installed.clear();
	for (const name of packages) {
		installed.add(name);
	}
}

async function resolveHybrid(): Promise<{ rules: Set<string>; warnings: Array<string> }> {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	try {
		const configs = await isentinel({
			name: "test/type-aware-backend",
			...baseOptions,
			oxlint: true,
		});
		const rules = new Set<string>();
		for (const config of configs) {
			if (config.name?.startsWith("isentinel/typescript") !== true) {
				continue;
			}

			const entries = Object.entries(config.rules ?? {});
			for (const [rule, value] of entries) {
				if (value !== "off" && value !== 0) {
					rules.add(rule);
				}
			}
		}

		return { rules, warnings: warn.mock.calls.map((call) => String(call[0])) };
	} finally {
		warn.mockRestore();
	}
}

describe("type-aware oxlint backend detection", () => {
	it.for([
		{ expected: true, packages: ["tsrs"] },
		{ expected: true, packages: ["oxlint-tsgolint"] },
		{ expected: true, packages: ["tsrs", "oxlint-tsgolint"] },
		{ expected: false, packages: [] },
	])("should report $expected for $packages", ({ expected, packages }, { expect }) => {
		expect.assertions(1);

		install(...packages);

		expect(hasTypeAwareBackend()).toBe(expected);
	});

	it("should enable typeAware in oxlint with only tsrs installed", ({ expect }) => {
		expect.assertions(1);

		install("tsrs");
		const config = oxlintIsentinel({ name: "test/tsrs-oxlint", ...baseOptions });

		expect(config.options!.typeAware).toBe(true);
	});

	it("should drop covered type-aware rules from ESLint with only tsrs installed", async ({
		expect,
	}) => {
		expect.assertions(2);

		install("tsrs");
		const { rules, warnings } = await resolveHybrid();

		expect(rules.has("ts/no-floating-promises")).toBe(false);
		expect(warnings.some((message) => message.includes(MISSING_BACKEND))).toBe(false);
	});

	it("should keep type-aware rules in ESLint and warn without a backend", async ({ expect }) => {
		expect.assertions(2);

		install();
		const { rules, warnings } = await resolveHybrid();

		expect(rules.has("ts/no-floating-promises")).toBe(true);
		expect(warnings.some((message) => message.includes(MISSING_BACKEND))).toBe(true);
	});
});
