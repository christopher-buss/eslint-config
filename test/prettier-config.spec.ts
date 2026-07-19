import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isentinel } from "../src";
import { isentinel as oxlint } from "../src/oxlint";
import { PRETTIER_DEFAULTS, resolvePrettierSettings } from "../src/prettier-config";

/**
 * Resolve settings against a throwaway project directory containing the given
 * files.
 *
 * @param files - File names mapped to their contents.
 * @param prettierOptions - Explicit factory options to merge on top.
 * @returns The resolved settings.
 */
function settingsFor(
	files: Record<string, string>,
	prettierOptions: Record<string, unknown> = {},
): Record<string, unknown> {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "isentinel-prettier-"));

	try {
		for (const [name, contents] of Object.entries(files)) {
			fs.writeFileSync(path.join(directory, name), contents, "utf-8");
		}

		return resolvePrettierSettings(prettierOptions, directory);
	} finally {
		fs.rmSync(directory, { force: true, recursive: true });
	}
}

describe("resolvePrettierSettings", () => {
	it("falls back to the preset defaults", () => {
		expect.hasAssertions();

		expect(settingsFor({})).toStrictEqual({ ...PRETTIER_DEFAULTS });
	});

	it("reads .prettierrc as JSON", () => {
		expect.hasAssertions();

		expect(settingsFor({ ".prettierrc": '{"printWidth": 80}' })["printWidth"]).toBe(80);
	});

	it("reads .prettierrc.yaml", () => {
		expect.hasAssertions();

		const settings = settingsFor({ ".prettierrc.yaml": "printWidth: 70\ntabWidth: 2\n" });

		expect(settings).toMatchObject({ printWidth: 70, tabWidth: 2 });
	});

	it("reads the package.json prettier key", () => {
		expect.hasAssertions();

		const settings = settingsFor({
			"package.json": '{"name": "x", "prettier": {"printWidth": 60}}',
		});

		expect(settings["printWidth"]).toBe(60);
	});

	it("ignores a package.json prettier key naming a shareable config", () => {
		expect.hasAssertions();

		const settings = settingsFor({
			"package.json": '{"name": "x", "prettier": "@company/prettier-config"}',
		});

		expect(settings["printWidth"]).toBe(PRETTIER_DEFAULTS.printWidth);
	});

	it("translates EditorConfig properties", () => {
		expect.hasAssertions();

		const settings = settingsFor({
			".editorconfig": [
				"root = true",
				"",
				"[*]",
				"end_of_line = lf",
				"indent_style = space",
				"indent_size = 2",
				"max_line_length = 90",
			].join("\n"),
		});

		expect(settings).toMatchObject({
			endOfLine: "lf",
			printWidth: 90,
			tabWidth: 2,
			useTabs: false,
		});
	});

	it("applies EditorConfig sections matching source files", () => {
		expect.hasAssertions();

		const settings = settingsFor({
			".editorconfig": [
				"root = true",
				"",
				"[*]",
				"indent_size = 8",
				"",
				"[*.{ts,tsx}]",
				"indent_size = 3",
			].join("\n"),
		});

		expect(settings["tabWidth"]).toBe(3);
	});

	it("lets a Prettier config win over EditorConfig", () => {
		expect.hasAssertions();

		const settings = settingsFor({
			".editorconfig": "root = true\n\n[*]\nmax_line_length = 90\n",
			".prettierrc": '{"printWidth": 80}',
		});

		expect(settings["printWidth"]).toBe(80);
	});

	it("lets explicit factory options win over everything", () => {
		expect.hasAssertions();

		const settings = settingsFor({ ".prettierrc": '{"printWidth": 80}' }, { printWidth: 55 });

		expect(settings["printWidth"]).toBe(55);
	});
});

/**
 * Read the options of the arrow rule out of a rule map.
 *
 * @param rules - The rule map to read from.
 * @returns The rule's options object, if the rule is present.
 */
function arrowOptions(rules: Record<string, unknown> | undefined): unknown {
	const entry = rules?.["flawless/arrow-return-style"];
	return Array.isArray(entry) ? entry[1] : undefined;
}

describe("factory parity", () => {
	it("gives both engines the same arrow-return-style options", async () => {
		expect.hasAssertions();

		const eslintConfigs = await isentinel({ roblox: false, type: "package" });
		const eslintRules = eslintConfigs.find(
			(config) => config.name === "isentinel/flawless/rules",
		)?.rules;

		// Emitted overrides carry no name, so the rule itself is the anchor.
		const oxlintConfig = oxlint({ name: "test/parity", roblox: false, type: "package" });
		const oxlintRules = oxlintConfig.overrides?.find(
			(override) => override.rules?.["flawless/arrow-return-style"] !== undefined,
		)?.rules;

		const fromEslint = arrowOptions(eslintRules);

		expect(fromEslint).toBeDefined();
		expect(arrowOptions(oxlintRules as Record<string, unknown>)).toStrictEqual(fromEslint);
	});
});
