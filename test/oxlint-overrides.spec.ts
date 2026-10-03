import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, vi } from "vitest";

import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import type { OxlintConfig, OxlintFactoryOptions } from "../src/oxlint/index.ts";
import { effectiveOxlintRules } from "./oxlint-helpers.ts";
import { OXLINT_TIMEOUT, runOxlint } from "./oxlint-run.ts";

// Formatting is off throughout: nothing here tests it, and the oxfmt native
// binding is the one part of a generated config known to take the whole
// process down (see the segfault note in docs/oxlint.md).
const baseOptions = {
	name: "test/overrides",
	formatters: false,
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	roblox: false,
	spellCheck: false,
	type: "package",
} as const satisfies OxlintFactoryOptions;

const SPEC_FILE = "src/sample.spec.ts";
const SOURCE_FILE = "src/sample.ts";

/**
 * Build a config while capturing the dropped-override warnings it emits.
 *
 * @param options - Factory options to merge over the shared base.
 * @returns The generated config and the warning messages.
 */
function buildWithWarnings(options: Omit<OxlintFactoryOptions, "name">): {
	config: OxlintConfig;
	warnings: Array<string>;
} {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

	try {
		const config = oxlintIsentinel({ ...baseOptions, ...options });
		return { config, warnings: warn.mock.calls.map((call) => String(call[0])) };
	} finally {
		warn.mockRestore();
	}
}

/**
 * Write a config and a sample spec file to a temp directory and lint it.
 *
 * @param config - The generated oxlint config.
 * @returns The diagnostics, as `file:line rule` strings.
 */
function lintSpecFixture(config: OxlintConfig): Array<string> {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "isentinel-overrides-"));

	fs.writeFileSync(path.join(directory, ".oxlintrc.json"), JSON.stringify(config));
	fs.writeFileSync(
		path.join(directory, "sample.spec.ts"),
		'import { describe, expect, it } from "vitest";\n\n' +
			'describe("a", () => {\n\tit("b", () => {\n\t\texpect(1).toBe(1);\n\t});\n});\n',
	);

	return runOxlint(directory, true);
}

describe("oxlint overrides", () => {
	it("should keep a disable for a rule the preset never enables", ({ expect }) => {
		expect.assertions(1);

		const { config } = buildWithWarnings({
			test: { vitest: { overrides: { "vitest/require-hook": "off" } } },
		});

		const effective = effectiveOxlintRules(config, SPEC_FILE);

		expect(effective.get("vitest/require-hook")).toBe("off");
	});

	it("should enable a rule the preset never enables, at the option's own scope", ({ expect }) => {
		expect.assertions(2);

		const { config } = buildWithWarnings({
			test: { vitest: { overrides: { "vitest/require-hook": "error" } } },
		});

		expect(effectiveOxlintRules(config, SPEC_FILE).get("vitest/require-hook")).toBe("enabled");
		expect(effectiveOxlintRules(config, SOURCE_FILE).has("vitest/require-hook")).toBe(false);
	});

	// The reported case: the entry was dropped by the splitter, so the rule kept
	// firing wherever a consumer had the `style` category on.
	it("should silence a disabled rule end to end", { timeout: OXLINT_TIMEOUT }, ({ expect }) => {
		expect.assertions(2);

		const overrides = { "vitest/no-importing-vitest-globals": "off" } as const;
		const { config } = buildWithWarnings({
			categories: { style: "warn" },
			test: { vitest: { files: ["**/*.spec.ts"], overrides } },
		});
		const { config: withoutOverride } = buildWithWarnings({
			categories: { style: "warn" },
			test: { vitest: { files: ["**/*.spec.ts"] } },
		});

		const rule = "vitest(no-importing-vitest-globals)";

		expect(lintSpecFixture(withoutOverride).some((entry) => entry.includes(rule))).toBe(true);
		expect(lintSpecFixture(config).some((entry) => entry.includes(rule))).toBe(false);
	});

	// An override applies at its own config module's position, so the later
	// `oxc` module would re-enable this one; turning that module off leaves the
	// translation as the only thing under test.
	it("should route an oxc-covered rule to the oxc rule it resolves to", ({ expect }) => {
		expect.assertions(1);

		const { config } = buildWithWarnings({
			oxc: false,
			typescript: { overrides: { "unicorn/no-accidental-bitwise-operator": "off" } },
		});

		const effective = effectiveOxlintRules(config, SOURCE_FILE);

		expect(effective.get("oxc/bad-bitwise-operator")).toBe("off");
	});

	// `ts/no-shadow` and the bare core rule collapse onto one native entry, and
	// the extension normally wins; an override outranks it either way.
	it("should let an override win the ts-extension collapse", ({ expect }) => {
		expect.assertions(1);

		const { config } = buildWithWarnings({
			typescript: { overrides: { "no-shadow": "off" } },
		});

		const effective = effectiveOxlintRules(config, SOURCE_FILE);

		expect(effective.get("no-shadow")).toBe("off");
	});

	it("should warn about an override oxlint cannot run at all", ({ expect }) => {
		expect.assertions(2);

		const { config, warnings } = buildWithWarnings({
			typescript: { overrides: { "ts/prefer-destructuring": "off" } },
		});

		const effective = effectiveOxlintRules(config, SOURCE_FILE);

		expect(warnings.join("\n")).toContain("ts/prefer-destructuring");
		expect(effective.has("typescript/prefer-destructuring")).toBe(false);
	});

	it("should warn about an override native-only mode drops", ({ expect }) => {
		expect.assertions(1);

		const { warnings } = buildWithWarnings({
			jsPlugins: false,
			test: { vitest: { overrides: { "vitest/padding-around-all": "error" } } },
		});

		expect(warnings.join("\n")).toContain("padding-around-all");
	});

	it("should stay silent when the warning is turned off", ({ expect }) => {
		expect.assertions(1);

		const { warnings } = buildWithWarnings({
			typescript: { overrides: { "ts/prefer-destructuring": "off" } },
			warnDroppedOverrides: false,
		});

		expect(warnings).toHaveLength(0);
	});

	it("should not warn about the preset's own dropped rules", ({ expect }) => {
		expect.assertions(1);

		const { warnings } = buildWithWarnings({ jsPlugins: false, test: { vitest: true } });

		expect(warnings).toHaveLength(0);
	});
});
