import { ESLint } from "eslint";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "vitest";
import { describe, it } from "vitest";

import { isRecord } from "../src/guards.ts";
import type { OptionsConfig } from "../src/index.ts";
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

interface EslintOptions {
	ignoresTypeAware?: Array<string>;
	naming?: NonNullable<OptionsConfig["naming"]>;
	roblox?: NonNullable<OptionsConfig["roblox"]>;
	root?: Array<string>;
	typeAwareRoot?: boolean;
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
	{ ignoresTypeAware, naming = true, roblox = true, root, typeAwareRoot }: EslintOptions,
): Promise<ESLint> {
	const composer = await isentinel({
		name: "test/ignores-type-aware",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		naming,
		pnpm: false,
		react: true,
		roblox,
		root,
		spellCheck: false,
		typescript: {
			...(ignoresTypeAware === undefined ? {} : { ignoresTypeAware }),
			...(typeAwareRoot === undefined ? {} : { typeAwareRoot }),
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
		const eslint = await createEslint(projectDirectory, {
			ignoresTypeAware: ["**/*.config.ts"],
		});

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
		const eslint = await createEslint(projectDirectory, {
			ignoresTypeAware: ["**/*.ts", "!**/src/**"],
		});

		const declaration = await resolveFile(
			eslint,
			path.join(projectDirectory, "src", "foo.d.ts"),
		);
		const source = await resolveFile(eslint, path.join(projectDirectory, "src", "foo.ts"));

		expect(declaration.rules).not.toContain("flawless/naming-convention");
		expect(source.rules).toContain("flawless/naming-convention");
	});

	it("should let naming.ignoresTypeAware replace the shared globs", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(2);

		const projectDirectory = await prepareProject(onTestFinished);
		const eslint = await createEslint(projectDirectory, {
			naming: { ignoresTypeAware: ["**/*.config.ts"] },
		});

		const ignored = await resolveFile(
			eslint,
			path.join(projectDirectory, "src", "foo.config.ts"),
		);

		expect(ignored.rules).not.toContain("flawless/naming-convention");
		expect(ignored.rules).toContain("ts/no-floating-promises");
	});

	it("should not let a roblox.files negation re-include an ignored file", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(4);

		const projectDirectory = await prepareProject(onTestFinished);
		const eslint = await createEslint(projectDirectory, {
			ignoresTypeAware: ["**/*.config.ts"],
			roblox: { files: [["src/**/*.ts", "!**/*.config.ts"]] },
		});

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

	it("should keep complement rules on files outside the roblox scope", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		const projectDirectory = await prepareProject(onTestFinished);
		const eslint = await createEslint(projectDirectory, {
			ignoresTypeAware: ["**/*.config.ts"],
			roblox: { files: ["src/client/**/*.ts"] },
		});

		const ignored = await resolveFile(
			eslint,
			path.join(projectDirectory, "src", "node", "foo.config.ts"),
		);
		const complement = await resolveFile(
			eslint,
			path.join(projectDirectory, "src", "node", "foo.ts"),
		);

		expect(ignored.rules.filter((rule) => TYPE_AWARE_RULES.includes(rule))).toStrictEqual([]);
		expect(complement.projectService).toBeTruthy();
		expect(complement.rules).toContain("ts/no-floating-promises");
	});
});

describe("typescript.typeAwareRoot", () => {
	const rootFiles = [["packages", "a", "vitest.config.ts"], ["eslint.config.ts"]];

	it("should remove every type-aware block from root files when false", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(6);

		const projectDirectory = await prepareProject(onTestFinished);
		const eslint = await createEslint(projectDirectory, { typeAwareRoot: false });

		for (const segments of rootFiles) {
			const resolved = await resolveFile(eslint, path.join(projectDirectory, ...segments));

			expect(resolved.projectService).toBeFalsy();
			expect(resolved.rules.filter((rule) => TYPE_AWARE_RULES.includes(rule))).toStrictEqual(
				[],
			);
		}

		const source = await resolveFile(
			eslint,
			path.join(projectDirectory, "packages", "a", "src", "foo.ts"),
		);

		expect(source.projectService).toBeTruthy();
		expect(source.rules).toStrictEqual(expect.arrayContaining(TYPE_AWARE_RULES));
	});

	it("should keep other type-aware ignores for project source files", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		const projectDirectory = await prepareProject(onTestFinished);
		const eslint = await createEslint(projectDirectory, {
			ignoresTypeAware: ["**/*.config.ts"],
			typeAwareRoot: false,
		});
		const sourceDirectory = path.join(projectDirectory, "packages", "a", "src");

		const declaration = await resolveFile(eslint, path.join(sourceDirectory, "foo.d.ts"));
		const ignored = await resolveFile(eslint, path.join(sourceDirectory, "foo.config.ts"));
		const source = await resolveFile(eslint, path.join(sourceDirectory, "foo.ts"));

		expect(declaration.rules).not.toContain("flawless/naming-convention");
		expect(ignored.projectService).toBeFalsy();
		expect(source.projectService).toBeTruthy();
	});

	it("should keep type information for a glob removed from root", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(4);

		const projectDirectory = await prepareProject(onTestFinished);
		const eslint = await createEslint(projectDirectory, {
			root: ["!packages/*/*"],
			typeAwareRoot: false,
		});

		const kept = await resolveFile(
			eslint,
			path.join(projectDirectory, "packages", "a", "vitest.config.ts"),
		);
		const untyped = await resolveFile(eslint, path.join(projectDirectory, "eslint.config.ts"));

		expect(kept.projectService).toBeTruthy();
		expect(kept.rules).toStrictEqual(expect.arrayContaining(TYPE_AWARE_RULES));
		expect(untyped.projectService).toBeFalsy();
		expect(untyped.rules.filter((rule) => TYPE_AWARE_RULES.includes(rule))).toStrictEqual([]);
	});

	it("should keep type information for a file excluded from root", async ({
		expect,
		onTestFinished,
	}) => {
		expect.assertions(3);

		const projectDirectory = await prepareProject(onTestFinished);
		const eslint = await createEslint(projectDirectory, {
			root: ["!lint.ts"],
			typeAwareRoot: false,
		});

		const excluded = await resolveFile(eslint, path.join(projectDirectory, "lint.ts"));
		const untyped = await resolveFile(eslint, path.join(projectDirectory, "vitest.config.ts"));

		expect(excluded.projectService).toBeTruthy();
		expect(excluded.rules).toContain("ts/no-floating-promises");
		expect(untyped.projectService).toBeFalsy();
	});

	it("should not change root files when true", async ({ expect, onTestFinished }) => {
		expect.assertions(2);

		const projectDirectory = await prepareProject(onTestFinished);
		const defaults = await createEslint(projectDirectory, {});
		const enabled = await createEslint(projectDirectory, { typeAwareRoot: true });

		const filePaths = rootFiles.map((segments) => path.join(projectDirectory, ...segments));
		const defaultFiles: Array<ResolvedFile> = [];
		const enabledFiles: Array<ResolvedFile> = [];
		for (const filePath of filePaths) {
			defaultFiles.push(await resolveFile(defaults, filePath));
			enabledFiles.push(await resolveFile(enabled, filePath));
		}

		expect(defaultFiles.every((file) => Boolean(file.projectService))).toBe(true);
		expect(enabledFiles).toStrictEqual(defaultFiles);
	});
});
