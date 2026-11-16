import { ESLint } from "eslint";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { isRecord } from "../src/guards.ts";
import { isentinel } from "../src/index.ts";
import { oxlintDisables } from "../src/oxlint/configs/disables.ts";
import { oxlintUnicorn } from "../src/oxlint/configs/unicorn.ts";
import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";

interface RootRules {
	defaultExportOff: boolean;
	filenamesUnchecked: boolean;
}

async function rootRulesFor(files: Array<string>, root?: Array<string>): Promise<Array<RootRules>> {
	const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "isentinel-root-globs-"));
	try {
		const composer = await isentinel({
			name: "test/root-globs",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			pnpm: false,
			spellCheck: false,
			...(root ? { root } : {}),
		});
		const eslint = new ESLint({
			cwd,
			overrideConfig: [...composer],
			overrideConfigFile: true,
		});

		return await Promise.all(
			files.map(async (file) => {
				const config: unknown = await eslint.calculateConfigForFile(path.join(cwd, file));
				const rules = isRecord(config) && isRecord(config["rules"]) ? config["rules"] : {};
				const defaultExport = rules["import/no-default-export"];
				const nameReplacements = rules["unicorn/name-replacements"];
				const nameOptions: unknown = Array.isArray(nameReplacements)
					? nameReplacements[1]
					: undefined;
				return {
					defaultExportOff: Array.isArray(defaultExport) && defaultExport[0] === 0,
					filenamesUnchecked:
						isRecord(nameOptions) && nameOptions["checkFilenames"] === false,
				};
			}),
		);
	} finally {
		await fs.rm(cwd, { force: true, recursive: true });
	}
}

function rootOverrides<T extends { files: Array<string> }>(overrides: Array<T> = []): Array<T> {
	return overrides.filter((override) => {
		return override.files.some((glob) => glob === "./*" || glob.startsWith("./*."));
	});
}

const ROOT = { defaultExportOff: true, filenamesUnchecked: true };
const NOT_ROOT = { defaultExportOff: false, filenamesUnchecked: false };

describe("root globs", () => {
	it("applies root rules to config files only", async ({ expect }) => {
		expect.assertions(1);

		await expect(
			rootRulesFor([
				"eslint.config.ts",
				"packages/a/eslint.config.ts",
				"packages/group/name/eslint.config.ts",
				"packages/a/src/index.ts",
				"packages/a/test/foo.ts",
				"apps/a/tests/foo.ts",
			]),
		).resolves.toStrictEqual([ROOT, ROOT, ROOT, NOT_ROOT, NOT_ROOT, NOT_ROOT]);
	});

	it("adds and removes user root globs", async ({ expect }) => {
		expect.assertions(1);

		await expect(
			rootRulesFor(
				["places/a/b/c.ts", "packages/a/eslint.config.ts", "packages/a/src/index.ts"],
				["places/**", "!packages/*/*"],
			),
		).resolves.toStrictEqual([ROOT, NOT_ROOT, NOT_ROOT]);
	});

	it("excludes files matched by a non-default negated root glob", async ({ expect }) => {
		expect.assertions(1);

		await expect(
			rootRulesFor(
				["lint.ts", "vitest.config.ts", "packages/a/lint.ts"],
				["!lint.ts", "!packages/*/lint.ts"],
			),
		).resolves.toStrictEqual([NOT_ROOT, ROOT, NOT_ROOT]);
	});

	it("excludes negated root globs from the oxlint root blocks", ({ expect }) => {
		expect.assertions(2);

		const config = oxlintIsentinel({
			name: "test/root-globs-oxlint",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			root: ["!lint.ts"],
		});
		const rootBlocks = rootOverrides(config.overrides);

		expect(rootBlocks.length).toBeGreaterThanOrEqual(2);
		expect(rootBlocks.map((override) => override.excludeFiles)).toStrictEqual(
			rootBlocks.map(() => ["{packages,apps,libs}/*/{src,test,tests}/*", "./lint.ts"]),
		);
	});

	it("excludes source folders from the oxlint root blocks", ({ expect }) => {
		expect.assertions(1);

		const rootBlocks = [
			...oxlintUnicorn(),
			...oxlintDisables({ root: ["*"], workspaceRoot: os.tmpdir() }),
		].filter((config) => /\/root(?:\/js-plugin)?$/.test(config.name));

		expect(rootBlocks.map((config) => config.excludeFiles)).toStrictEqual(
			rootBlocks.map(() => ["{packages,apps,libs}/*/{src,test,tests}/*"]),
		);
	});
});
