import { describe, expect, it, vi } from "vitest";

import { isentinel } from "../src";
import type { OptionsConfig, TypedFlatConfigItem } from "../src/eslint/types";

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
	spellCheck: false,
} as const;

const DEAD_HEADER = "oxlint owns in hybrid mode";

async function collectDeadWarnings(
	options: Record<string, unknown>,
	...userConfigs: Array<TypedFlatConfigItem>
): Promise<Array<string>> {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

	let messages: Array<string>;
	try {
		const composer = await isentinel(
			options as OptionsConfig & TypedFlatConfigItem & { namedConfigs?: false },
			...userConfigs,
		);
		void [...composer];
		messages = warn.mock.calls.map((call) => String(call[0]));
	} finally {
		warn.mockRestore();
	}

	return messages.filter((message) => message.includes(DEAD_HEADER));
}

describe("oxlint hybrid dead-rule warnings", () => {
	it("should warn when a trailing user config references a mapped rule", async () => {
		expect.hasAssertions();

		const warnings = await collectDeadWarnings(
			{ ...baseOptions, oxlint: true },
			{
				name: "user/console",
				rules: { "no-console": "off" },
			},
		);

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("no-console");
		expect(warnings[0]).toContain("user/console");
	});

	it("should warn for options-level rules as an unnamed config", async () => {
		expect.hasAssertions();

		const warnings = await collectDeadWarnings({
			...baseOptions,
			oxlint: true,
			rules: { "no-console": "off" },
		});

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("no-console");
		expect(warnings[0]).toContain("an unnamed config");
	});

	it("should warn for the oxfmt formatting rule", async () => {
		expect.hasAssertions();

		const warnings = await collectDeadWarnings(
			{ ...baseOptions, oxlint: true },
			{
				name: "user/format",
				rules: { "oxfmt/oxfmt": "off" },
			},
		);

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("oxfmt/oxfmt");
	});

	it("should not warn for Markdown-scoped user configs", async () => {
		expect.hasAssertions();

		const warnings = await collectDeadWarnings(
			{ ...baseOptions, oxlint: true },
			{
				name: "user/markdown",
				files: ["**/*.md/**"],
				rules: { "no-console": "error" },
			},
		);

		expect(warnings).toStrictEqual([]);
	});

	it("should not warn for rules that stay in ESLint", async () => {
		expect.hasAssertions();

		const warnings = await collectDeadWarnings(
			{ ...baseOptions, oxlint: true },
			{
				name: "user/stays",
				// oxlint-disable-next-line typescript/no-deprecated -- Used to test that ESLint rules don't warn in hybrid mode
				rules: { "eslint-comments/no-unused-disable": "off" },
			},
		);

		expect(warnings).toStrictEqual([]);
	});

	it("should not warn when oxlint hybrid mode is disabled", async () => {
		expect.hasAssertions();

		const warnings = await collectDeadWarnings(
			{ ...baseOptions, oxlint: false },
			{
				name: "user/console",
				rules: { "no-console": "off" },
			},
		);

		expect(warnings).toStrictEqual([]);
	});

	it("should be suppressible via oxlintWarnDeadRules", async () => {
		expect.hasAssertions();

		const warnings = await collectDeadWarnings(
			{ ...baseOptions, oxlint: true, oxlintWarnDeadRules: false },
			{ name: "user/console", rules: { "no-console": "off" } },
		);

		expect(warnings).toStrictEqual([]);
	});
});
