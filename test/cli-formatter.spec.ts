import { getStaticJSONValue, parseJSON } from "jsonc-eslint-parser";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { TestContext } from "vitest";
import { describe, it, vi } from "vitest";

import { versionsMap } from "../src/cli/constants-generated.ts";
import { OXC_VSCODE_EXTENSION, vscodeSettingsString } from "../src/cli/constants.ts";
import { updateEslintFiles } from "../src/cli/stages/update-eslint-files.ts";
import { updatePackageJson } from "../src/cli/stages/update-package-json.ts";
import { updateVscodeSettings } from "../src/cli/stages/update-vscode-settings.ts";
import type { PromptResult } from "../src/cli/types.ts";
import { isRecord } from "../src/guards.ts";

const STANDALONE: PromptResult = {
	formatter: "standalone",
	frameworks: [],
	uncommittedConfirmed: true,
	updateVscodeSettings: true,
};

function useProject(onTestFinished: TestContext["onTestFinished"]): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "isentinel-cli-"));
	onTestFinished(() => {
		vi.restoreAllMocks();
		fs.rmSync(directory, { force: true, recursive: true });
	});
	fs.writeFileSync(path.join(directory, "package.json"), '{ "name": "x", "type": "module" }');
	vi.spyOn(process, "cwd").mockReturnValue(directory);
	vi.spyOn(process.stdout, "write").mockReturnValue(true);
	return directory;
}

function readJsonc(text: string): Record<string, unknown> {
	const value: unknown = getStaticJSONValue(parseJSON(text, { jsonSyntax: "jsonc" }));
	if (!isRecord(value)) {
		throw new TypeError("expected an object");
	}

	return value;
}

describe("vscodeSettingsString", () => {
	it("hands formatting to the oxc extension in standalone mode", ({ expect }) => {
		expect.assertions(4);

		const settings = readJsonc(`{${vscodeSettingsString("standalone")}}`);

		expect(settings["eslint.format.enable"]).toBe(false);
		expect(settings["oxc.fmt.disableNestedConfig"]).toBe(true);
		expect(settings["[typescript]"]).toStrictEqual({
			"editor.defaultFormatter": OXC_VSCODE_EXTENSION,
			"editor.formatOnSave": true,
		});
		expect(settings).not.toHaveProperty("editor.formatOnSave");
	});

	it("keeps formatting in ESLint by default", ({ expect }) => {
		expect.assertions(2);

		const settings = readJsonc(`{${vscodeSettingsString()}}`);

		expect(settings["editor.formatOnSave"]).toBe(false);
		expect(settings).not.toHaveProperty("[typescript]");
	});
});

describe("standalone setup", () => {
	it("writes oxfmt.config.ts and sets the formatter option", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		const cwd = useProject(onTestFinished);
		await updateEslintFiles(STANDALONE);

		expect(fs.readFileSync(path.join(cwd, "eslint.config.js"), "utf8")).toContain(
			'formatter: "standalone",',
		);
		expect(fs.readFileSync(path.join(cwd, "oxfmt.config.ts"), "utf8")).toBe(
			'import { isentinelOxfmt } from "@isentinel/eslint-config/oxfmt";\n\nexport default isentinelOxfmt({ cwd: import.meta.dirname });\n',
		);
	});

	it("hands migrated .eslintignore patterns to oxfmt too", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const cwd = useProject(onTestFinished);
		fs.writeFileSync(path.join(cwd, ".eslintignore"), "generated/");
		await updateEslintFiles(STANDALONE);

		expect(fs.readFileSync(path.join(cwd, "oxfmt.config.ts"), "utf8")).toContain(
			"ignorePatterns: [",
		);
	});

	it("keeps an existing .oxfmtrc.json and writes no config module", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		const cwd = useProject(onTestFinished);
		fs.writeFileSync(path.join(cwd, ".oxfmtrc.json"), "{}");
		await updateEslintFiles(STANDALONE);

		expect(fs.existsSync(path.join(cwd, "oxfmt.config.ts"))).toBe(false);
		expect(fs.readFileSync(path.join(cwd, ".oxfmtrc.json"), "utf8")).toBe("{}");
	});

	it("adds oxfmt and the format scripts to package.json", async ({ expect, onTestFinished }) => {
		expect.assertions(2);

		const cwd = useProject(onTestFinished);
		await updatePackageJson(STANDALONE, true);
		const manifest: unknown = JSON.parse(
			fs.readFileSync(path.join(cwd, "package.json"), "utf8"),
		);

		expect(manifest).toMatchObject({ devDependencies: { oxfmt: versionsMap.oxfmt } });
		expect(manifest).toMatchObject({
			scripts: {
				"format": "oxfmt --disable-nested-config",
				"format:check": "oxfmt --check --disable-nested-config",
			},
		});
	});

	it("recommends the oxc extension", async ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const cwd = useProject(onTestFinished);
		fs.mkdirSync(path.join(cwd, ".vscode"));
		fs.writeFileSync(
			path.join(cwd, ".vscode", "extensions.json"),
			'{ "recommendations": ["example.other-extension"] }',
		);
		await updateVscodeSettings(STANDALONE);

		expect(
			JSON.parse(fs.readFileSync(path.join(cwd, ".vscode", "extensions.json"), "utf8")),
		).toStrictEqual({ recommendations: ["example.other-extension", OXC_VSCODE_EXTENSION] });
	});
});
