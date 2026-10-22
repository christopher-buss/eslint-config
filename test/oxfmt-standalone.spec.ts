// cspell:words cjsx ctsx mjsx mtsx
import { ESLint } from "eslint";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { TestContext } from "vitest";
import { describe, it, vi } from "vitest";

import { expandBraces, unformattedFilePatterns } from "../src/formatted-files.ts";
import { GLOB_EXCLUDE } from "../src/globs.ts";
import { isRecord } from "../src/guards.ts";
import { isentinel } from "../src/index.ts";
import { isentinelOxfmt } from "../src/oxfmt/index.ts";
import { isentinel as oxlint } from "../src/oxlint/index.ts";

const OXFMT_ENTRY = pathToFileURL(path.resolve(import.meta.dirname, "../src/oxfmt/index.ts")).href;

/**
 * Point `process.cwd()` at a throwaway project holding the given files.
 *
 * @param onTestFinished - Registers the cleanup.
 * @param files - File names mapped to their contents.
 * @returns The project directory.
 */
function useProject(
	onTestFinished: TestContext["onTestFinished"],
	files: Record<string, string>,
): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "isentinel-oxfmt-"));
	onTestFinished(() => {
		vi.restoreAllMocks();
		fs.rmSync(directory, { force: true, recursive: true });
	});
	for (const [name, contents] of Object.entries(files)) {
		fs.writeFileSync(path.join(directory, name), contents, "utf-8");
	}

	vi.spyOn(process, "cwd").mockReturnValue(directory);
	return directory;
}

/**
 * Build an `oxfmt.config.ts` that calls `isentinelOxfmt` with `options`.
 *
 * @param options - Source text of the options object.
 * @returns The module source.
 */
function oxfmtConfigModule(options: string): string {
	return `import { isentinelOxfmt } from ${JSON.stringify(OXFMT_ENTRY)};\nexport default isentinelOxfmt(${options});\n`;
}

function ruleEntry(rules: unknown, rule: string): unknown {
	return isRecord(rules) ? rules[rule] : undefined;
}

function ruleOptions(rules: unknown, rule: string): unknown {
	const entry = isRecord(rules) ? rules[rule] : undefined;
	return Array.isArray(entry) ? entry[1] : undefined;
}

async function markdownCodeOptions(formatter: "eslint" | "standalone"): Promise<unknown> {
	const configs = await isentinel({ formatter, roblox: false, type: "package" });
	const { rules } = configs.find((config) => config.name === "isentinel/flawless/markdown-code")!;
	return ruleOptions(rules, "flawless/arrow-return-style");
}

async function effectiveRules(file: string): Promise<unknown> {
	const configs = await isentinel({ roblox: false, type: "package" });
	const eslint = new ESLint({ overrideConfig: [...configs], overrideConfigFile: true });
	const config: unknown = await eslint.calculateConfigForFile(file);
	return isRecord(config) ? config["rules"] : undefined;
}

function severityOf(rules: unknown, rule: string): unknown {
	const entry = ruleEntry(rules, rule);
	return Array.isArray(entry) ? entry[0] : entry;
}

function enablesOxfmt(rules: unknown): boolean {
	const entry = isRecord(rules) ? rules["oxfmt/oxfmt"] : undefined;
	const severity: unknown = Array.isArray(entry) ? entry[0] : entry;
	return severity !== undefined && severity !== "off" && severity !== 0;
}

describe("isentinelOxfmt", () => {
	it("appends ignore patterns and overrides, and replaces other keys", ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(5);

		useProject(onTestFinished, {});
		const config = isentinelOxfmt({
			ignorePatterns: ["generated/**"],
			overrides: [{ files: ["*.json"], options: { tabWidth: 8 } }],
			printWidth: 120,
			sortImports: false,
		});

		expect(config.printWidth).toBe(120);
		expect(config.sortImports).toBe(false);
		expect(config.ignorePatterns).toStrictEqual([
			...unformattedFilePatterns(),
			...GLOB_EXCLUDE,
			"generated/**",
		]);
		expect(config.overrides!.map((override) => override.files)).toStrictEqual([
			["**/*.md"],
			["**/*.y{,a}ml"],
			["**/*.json5"],
			["*.json"],
		]);
		expect(config.overrides![0]!.options).toMatchObject({
			printWidth: 80,
			proseWrap: "always",
		});
	});

	it("formats only the files ESLint mode formats", ({ expect }) => {
		expect.assertions(4);

		const patterns = unformattedFilePatterns();

		expect(patterns.slice(0, 2)).toStrictEqual(["*", "!*/"]);
		expect(patterns).toContain("!**/*.cjs");
		expect(patterns).toContain("!**/*.json5");
		expect(
			patterns.filter((pattern) => /toml|mdx|markdown|htm$|gql|vue/.test(pattern)),
		).toStrictEqual([]);
	});

	it("takes componentExts and formatters as the factories do", ({ expect }) => {
		expect.assertions(3);

		const patterns = unformattedFilePatterns({
			componentExts: ["vue"],
			formatters: { css: false, markdown: false },
		});

		expect(patterns).toContain("!**/*.vue");
		expect(patterns).not.toContain("!**/*.md");
		expect(unformattedFilePatterns({ formatters: false })).toStrictEqual([
			"*",
			"!*/",
			"!**/*.js",
			"!**/*.cjs",
			"!**/*.mjs",
			"!**/*.jsx",
			"!**/*.cjsx",
			"!**/*.mjsx",
			"!**/*.ts",
			"!**/*.cts",
			"!**/*.mts",
			"!**/*.tsx",
			"!**/*.ctsx",
			"!**/*.mtsx",
		]);
	});

	it("expands brace sets for ignore files", ({ expect }) => {
		expect.assertions(2);

		expect(expandBraces("**/*.y{,a}ml")).toStrictEqual(["**/*.yml", "**/*.yaml"]);
		expect(expandBraces("a{b,{c,d}}e")).toStrictEqual(["abe", "ace", "ade"]);
	});

	it("starts from the preset defaults", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		useProject(onTestFinished, {});

		expect(isentinelOxfmt()).toMatchObject({ printWidth: 100, tabWidth: 4, useTabs: true });
	});
});

describe("oxfmt.config.ts loading", () => {
	it("keeps maxLen and hands oxfmt's printWidth to arrow-return-style", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		useProject(onTestFinished, { "oxfmt.config.ts": oxfmtConfigModule("{ printWidth: 100 }") });

		const eslintConfigs = await isentinel({
			roblox: false,
			stylistic: { maxLen: 80 },
			type: "package",
		});
		const { rules } = eslintConfigs.find(
			(config) => config.name === "isentinel/flawless/rules",
		)!;

		expect(ruleOptions(rules, "flawless/arrow-return-style")).toMatchObject({
			maxLen: 80,
			useOxfmt: { printWidth: 100 },
		});

		const oxlintConfig = oxlint({
			name: "test/oxfmt",
			roblox: false,
			stylistic: { maxLen: 80 },
			type: "package",
		});
		const oxlintRules = oxlintConfig.overrides!.find(
			(override) => override.rules!["flawless/arrow-return-style"] !== undefined,
		)!.rules;

		expect(ruleOptions(oxlintRules, "flawless/arrow-return-style")).toMatchObject({
			maxLen: 80,
			useOxfmt: { printWidth: 100 },
		});
	});

	it("reads printWidth and tabWidth from the config", async ({ expect, onTestFinished }) => {
		expect.assertions(3);

		useProject(onTestFinished, {
			"oxfmt.config.ts": oxfmtConfigModule("{ printWidth: 120, tabWidth: 2 }"),
		});

		const eslintConfigs = await isentinel({ roblox: false, type: "package" });
		const flawlessRules = eslintConfigs.find(
			(config) => config.name === "isentinel/flawless/rules",
		)!.rules;
		const oxfmtRules = eslintConfigs.find(
			(config) => config.name === "isentinel/oxfmt/typescript",
		)!.rules;

		expect(ruleOptions(flawlessRules, "flawless/arrow-return-style")).toMatchObject({
			maxLen: 120,
			tabWidth: 2,
			useOxfmt: { printWidth: 120 },
		});

		const formatOptions = ruleOptions(oxfmtRules, "oxfmt/oxfmt");

		expect(formatOptions).toMatchObject({ printWidth: 120, tabWidth: 2 });
		expect(formatOptions).not.toHaveProperty("ignorePatterns");
	});

	it("fails clearly when the config cannot load", async ({ expect, onTestFinished }) => {
		expect.assertions(2);

		useProject(onTestFinished, { "oxfmt.config.ts": "throw new Error('boom');\n" });

		await expect(isentinel({ roblox: false, type: "package" })).rejects.toThrow(
			/Failed to load oxfmt\.config\.ts/,
		);
		expect(() => oxlint({ name: "test/oxfmt", roblox: false, type: "package" })).toThrow(
			/Failed to load oxfmt\.config\.ts/,
		);
	});

	it("warns when an override changes the width of JS/TS files", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		useProject(onTestFinished, {
			"oxfmt.config.ts": oxfmtConfigModule(
				'{ overrides: [{ files: ["**/*.ts"], options: { printWidth: 80 } }] }',
			),
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		await isentinel({ roblox: false, type: "package" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("use the root values"));
	});
});

describe("oxfmt config discovery", () => {
	it("hands the oxlint factory a non-default width from the config", ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		useProject(onTestFinished, {
			"oxfmt.config.ts": oxfmtConfigModule("{ printWidth: 123, tabWidth: 3 }"),
		});

		const oxlintConfig = oxlint({ name: "test/oxfmt", roblox: false, type: "package" });
		const oxlintRules = oxlintConfig.overrides!.find(
			(override) => override.rules!["flawless/arrow-return-style"] !== undefined,
		)!.rules;

		expect(ruleOptions(oxlintRules, "flawless/arrow-return-style")).toMatchObject({
			maxLen: 123,
			tabWidth: 3,
			useOxfmt: { printWidth: 123 },
		});
	});

	it("finds the config in a parent directory", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const root = useProject(onTestFinished, { ".oxfmtrc.json": '{ "printWidth": 111 }' });
		const nested = path.join(root, "packages", "app");
		fs.mkdirSync(nested, { recursive: true });
		vi.spyOn(process, "cwd").mockReturnValue(nested);

		const configs = await isentinel({ roblox: false, type: "package" });
		const { rules } = configs.find((config) => config.name === "isentinel/oxfmt/typescript")!;

		expect(ruleOptions(rules, "oxfmt/oxfmt")).toMatchObject({ printWidth: 111 });
	});

	it("refuses two config files in one directory, as oxfmt does", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		useProject(onTestFinished, {
			".oxfmtrc.json": "{}",
			"oxfmt.config.ts": oxfmtConfigModule("{}"),
		});

		expect(() => oxlint({ name: "test/oxfmt", roblox: false, type: "package" })).toThrow(
			/Both '\.oxfmtrc\.json' and 'oxfmt\.config\.ts' found/,
		);
	});

	it("ignores config modules oxfmt does not discover", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		useProject(onTestFinished, { "oxfmt.config.js": "export default { printWidth: 111 };\n" });

		const configs = await isentinel({ roblox: false, type: "package" });
		const { rules } = configs.find((config) => config.name === "isentinel/oxfmt/typescript")!;

		expect(ruleOptions(rules, "oxfmt/oxfmt")).toMatchObject({ printWidth: 100 });
	});

	it("strips ignorePatterns and overrides from .oxfmtrc.json", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		useProject(onTestFinished, {
			".oxfmtrc.json": JSON.stringify({
				ignorePatterns: ["dist"],
				overrides: [{ files: ["*.md"], options: { printWidth: 60 } }],
				printWidth: 90,
			}),
		});

		const configs = await isentinel({ roblox: false, type: "package" });
		const { rules } = configs.find((config) => config.name === "isentinel/oxfmt/typescript")!;
		const options = ruleOptions(rules, "oxfmt/oxfmt");

		expect(options).toMatchObject({ printWidth: 90 });
		expect(options).not.toHaveProperty("ignorePatterns");
		expect(options).not.toHaveProperty("overrides");
	});

	it("warns for an override whose brace set reaches JS/TS files", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		const state: Record<symbol, unknown> = globalThis;
		delete state[Symbol.for("@isentinel/eslint-config/oxfmt-override-warned")];
		useProject(onTestFinished, {
			"oxfmt.config.ts": oxfmtConfigModule(
				'{ overrides: [{ files: ["src/**/*.{json,mts}"], options: { tabWidth: 2 } }] }',
			),
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		await isentinel({ roblox: false, type: "package" });

		expect(warn).toHaveBeenCalledOnce();
	});
});

describe("markdown code widths", () => {
	it("hands arrow-return-style the Markdown widths in Markdown code", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		useProject(onTestFinished, {});

		const widths = await Promise.all(
			(["eslint", "standalone"] as const).map(async (formatter) => {
				const configs = await isentinel({ formatter, roblox: false, type: "package" });
				const { rules } = configs.find(
					(config) => config.name === "isentinel/flawless/markdown-code",
				)!;
				return ruleOptions(rules, "flawless/arrow-return-style");
			}),
		);
		const expected = {
			jsxAlwaysUseExplicitReturn: true,
			maxLen: 80,
			maxObjectProperties: 2,
			namedExportsAlwaysUseExplicitReturn: true,
			objectReturnStyle: "complex-explicit",
			tabWidth: 2,
			useOxfmt: { printWidth: 80 },
		};

		expect(widths).toStrictEqual([expected, expected]);
	});

	it("takes the Markdown widths from the standalone config, overrides included", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		useProject(onTestFinished, {
			"oxfmt.config.ts": oxfmtConfigModule(
				'{ overrides: [{ files: ["docs/**/*.md"], options: { printWidth: 100, tabWidth: 4 } }] }',
			),
		});

		// The arrow limit stays shorter than the width oxfmt formats with.
		await expect(markdownCodeOptions("standalone")).resolves.toMatchObject({
			maxLen: 80,
			tabWidth: 4,
			useOxfmt: { printWidth: 100 },
		});
		// ESLint formats Markdown itself, with the preset's Markdown options.
		await expect(markdownCodeOptions("eslint")).resolves.toMatchObject({
			maxLen: 80,
			tabWidth: 2,
			useOxfmt: { printWidth: 80 },
		});
	});

	it("uses the root widths when no override matches Markdown", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(1);

		useProject(onTestFinished, {
			".oxfmtrc.json": JSON.stringify({
				overrides: [{ files: ["*.yaml"], options: { tabWidth: 2 } }],
				printWidth: 90,
				tabWidth: 3,
			}),
		});

		await expect(markdownCodeOptions("standalone")).resolves.toMatchObject({
			tabWidth: 3,
			useOxfmt: { printWidth: 90 },
		});
	});
});

describe("formatter: standalone", () => {
	it("keeps Stylua in ESLint", async ({ expect }) => {
		expect.assertions(1);

		const configs = await isentinel({ formatter: "standalone", type: "game" });

		expect(
			configs.some((config) => ruleEntry(config.rules, "format-lua/stylua") === "error"),
		).toBe(true);
	});

	it("enables oxfmt/oxfmt nowhere in ESLint but keeps the conflict disables", async ({
		expect,
	}) => {
		expect.assertions(2);

		const configs = await isentinel({
			formatter: "standalone",
			roblox: false,
			type: "package",
		});

		expect(configs.some((config) => enablesOxfmt(config.rules))).toBe(false);
		expect(
			configs.find((config) => config.name === "isentinel/oxfmt/typescript")!.rules![
				"style/indent"
			],
		).toBe("off");
	});

	it("turns the formatter-conflict rules off in Markdown code blocks", async ({ expect }) => {
		expect.assertions(2);

		const rules = await effectiveRules("docs/guide.md/0_0.ts");

		expect(severityOf(rules, "style/indent")).toBe(0);
		expect(severityOf(rules, "arrow-body-style")).toBe(0);
	});

	it("enables oxfmt/oxfmt nowhere in oxlint", ({ expect }) => {
		expect.assertions(1);

		const config = oxlint({
			name: "test/oxfmt",
			formatter: "standalone",
			roblox: false,
			type: "package",
		});

		expect(config.overrides!.some((override) => enablesOxfmt(override.rules))).toBe(false);
	});
});
