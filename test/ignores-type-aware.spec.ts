import { ESLint } from "eslint";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "vitest";
import { describe, it } from "vitest";

import { isRecord } from "../src/guards.ts";
import { isentinel } from "../src/index.ts";

/** One type-aware rule from each type-aware config block. */
const TYPE_AWARE_RULES = [
	"flawless/naming-convention",
	"flawless/no-ignored-return",
	"roblox/size-method",
	"ts/no-floating-promises",
];

interface ResolvedFile {
	projectService: unknown;
	rules: Array<string>;
}

async function prepareProject(onTestFinished: TestContext["onTestFinished"]): Promise<string> {
	const projectDirectory = await fs.mkdtemp(
		path.join(os.tmpdir(), "isentinel-ignores-type-aware-"),
	);
	onTestFinished(async () => {
		await fs.rm(projectDirectory, { force: true, recursive: true });
	});

	await fs.mkdir(path.join(projectDirectory, "src"), { recursive: true });
	await fs.writeFile(
		path.join(projectDirectory, "tsconfig.json"),
		`${JSON.stringify({ compilerOptions: { strict: true }, include: ["src"] })}\n`,
	);

	return projectDirectory;
}

async function createEslint(
	projectDirectory: string,
	ignoresTypeAware: Array<string>,
): Promise<ESLint> {
	const composer = await isentinel({
		name: "test/ignores-type-aware",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		naming: true,
		pnpm: false,
		spellCheck: false,
		typescript: {
			ignoresTypeAware,
			tsconfigPath: path.join(projectDirectory, "tsconfig.json"),
		},
	});

	return new ESLint({
		cwd: projectDirectory,
		overrideConfig: [...composer],
		overrideConfigFile: true,
	});
}

async function resolveFile(eslint: ESLint, filePath: string): Promise<ResolvedFile> {
	const config: unknown = await eslint.calculateConfigForFile(filePath);
	const languageOptions = isRecord(config) ? config["languageOptions"] : undefined;
	const parserOptions = isRecord(languageOptions) ? languageOptions["parserOptions"] : undefined;
	const rules = isRecord(config) && isRecord(config["rules"]) ? config["rules"] : {};

	return {
		projectService: isRecord(parserOptions) ? parserOptions["projectService"] : undefined,
		rules: Object.entries(rules)
			.filter(([, entry]) => {
				const severity: unknown = Array.isArray(entry) ? entry[0] : entry;
				return severity !== "off" && severity !== 0;
			})
			.map(([rule]) => rule),
	};
}

describe("typescript.ignoresTypeAware", () => {
	it("should remove every type-aware block from ignored files", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(4);

		const projectDirectory = await prepareProject(onTestFinished);
		const eslint = await createEslint(projectDirectory, ["**/*.config.ts"]);

		const ignored = await resolveFile(
			eslint,
			path.join(projectDirectory, "src", "foo.config.ts"),
		);
		const source = await resolveFile(eslint, path.join(projectDirectory, "src", "foo.ts"));

		expect(ignored.projectService).toBeFalsy();
		expect(ignored.rules.filter((rule) => TYPE_AWARE_RULES.includes(rule))).toStrictEqual([]);
		expect(source.projectService).toBeTruthy();
		expect(source.rules).toStrictEqual(expect.arrayContaining(TYPE_AWARE_RULES));
	});

	it("should keep the default ignores after a user negation", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		const projectDirectory = await prepareProject(onTestFinished);
		const eslint = await createEslint(projectDirectory, ["**/*.ts", "!**/src/**"]);

		const declaration = await resolveFile(
			eslint,
			path.join(projectDirectory, "src", "foo.d.ts"),
		);
		const source = await resolveFile(eslint, path.join(projectDirectory, "src", "foo.ts"));

		expect(declaration.rules).not.toContain("flawless/naming-convention");
		expect(source.rules).toContain("flawless/naming-convention");
	});
});
