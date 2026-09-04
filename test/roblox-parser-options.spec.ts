import { ESLint } from "eslint";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";

import type { JsonObject } from "../src/guards.ts";
import { isRecord } from "../src/guards.ts";
import { isentinel } from "../src/index.ts";
import type { OptionsConfig, TypedFlatConfigItem } from "../src/index.ts";

type TypescriptOptions = NonNullable<OptionsConfig["typescript"]>;

/**
 * Roblox linting scoped to a subset of the TypeScript files, as consumers do.
 */
const robloxFiles = ["src/**/*.ts"];

/**
 * Build the preset with roblox scoped to `src/**` and the given TypeScript
 * sub-options.
 *
 * @param typescript - The `typescript` sub-options under test.
 * @returns The resolved flat config array.
 */
async function buildConfigs(typescript: TypescriptOptions): Promise<Array<TypedFlatConfigItem>> {
	const composer = await isentinel({
		name: "test/roblox-parser-options",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		pnpm: false,
		roblox: { files: robloxFiles, filesTypeAware: robloxFiles },
		spellCheck: false,
		typescript,
	});

	return [...composer];
}

/**
 * The parser options of a named parser config entry.
 *
 * @param configs - The resolved flat config items.
 * @param name - The name of the parser config entry.
 * @returns The entry's parser options, or an empty record when absent.
 */
function parserOptionsOf(configs: Array<TypedFlatConfigItem>, name: string): JsonObject {
	const config = configs.find((item) => item.name === name);
	const parserOptions = config?.languageOptions?.["parserOptions"];
	return isRecord(parserOptions) ? parserOptions : {};
}

/**
 * The parser options ESLint resolves for a file, once every config entry has
 * merged.
 *
 * @param eslint - The ESLint instance to resolve through.
 * @param filePath - The file to resolve the config for.
 * @returns The effective parser options.
 */
async function resolveParserOptions(eslint: ESLint, filePath: string): Promise<JsonObject> {
	const config: unknown = await eslint.calculateConfigForFile(filePath);
	const languageOptions = isRecord(config) ? config["languageOptions"] : undefined;
	const parserOptions = isRecord(languageOptions) ? languageOptions["parserOptions"] : undefined;
	return isRecord(parserOptions) ? parserOptions : {};
}

/**
 * A temporary project with a tsconfig and one roblox-scoped source file.
 *
 * @returns The project directory.
 */
async function prepareProject(): Promise<string> {
	const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "isentinel-roblox-parser-"));
	onTestFinished(async () => {
		await fs.rm(projectDirectory, { force: true, recursive: true });
	});

	await fs.mkdir(path.join(projectDirectory, "src"), { recursive: true });
	await fs.writeFile(
		path.join(projectDirectory, "tsconfig.json"),
		`${JSON.stringify({ compilerOptions: { strict: true }, include: ["src"] }, undefined, "\t")}\n`,
	);
	await fs.writeFile(path.join(projectDirectory, "src", "example.ts"), "export const a = 1;\n");

	return projectDirectory;
}

describe("roblox parser options", () => {
	it("should forward outOfProjectFiles to the roblox type-aware parser", async () => {
		expect.assertions(2);

		const configs = await buildConfigs({
			outOfProjectFiles: [],
			tsconfigPath: "tsconfig.json",
		});

		const robloxOptions = parserOptionsOf(configs, "isentinel/roblox/type-aware-parser");
		const typescriptOptions = parserOptionsOf(
			configs,
			"isentinel/typescript/type-aware-parser",
		);

		expect(robloxOptions["projectService"]).toStrictEqual(typescriptOptions["projectService"]);
		expect(robloxOptions["projectService"]).toMatchObject({ allowDefaultProject: [] });
	});

	it("should forward parserOptionsTypeAware to the roblox type-aware parser", async () => {
		expect.assertions(2);

		const configs = await buildConfigs({
			outOfProjectFiles: [],
			parserOptionsTypeAware: { projectService: true },
			tsconfigPath: "tsconfig.json",
		});

		expect(
			parserOptionsOf(configs, "isentinel/roblox/type-aware-parser")["projectService"],
		).toBe(true);
		expect(
			parserOptionsOf(configs, "isentinel/typescript/type-aware-parser")["projectService"],
		).toBe(true);
	});

	it("should forward parserOptionsNonTypeAware to the roblox parser", async () => {
		expect.assertions(2);

		const configs = await buildConfigs({
			parserOptionsNonTypeAware: { sourceType: "script" },
			tsconfigPath: "tsconfig.json",
		});

		expect(parserOptionsOf(configs, "isentinel/roblox/parser")["sourceType"]).toBe("script");
		expect(parserOptionsOf(configs, "isentinel/roblox/type-aware-parser")["sourceType"]).toBe(
			"module",
		);
	});

	it("should keep shared parserOptions at the highest precedence", async () => {
		expect.assertions(2);

		const configs = await buildConfigs({
			parserOptions: { sourceType: "commonjs" },
			parserOptionsNonTypeAware: { sourceType: "script" },
			tsconfigPath: "tsconfig.json",
		});

		expect(parserOptionsOf(configs, "isentinel/roblox/parser")["sourceType"]).toBe("commonjs");
		expect(parserOptionsOf(configs, "isentinel/roblox/type-aware-parser")["sourceType"]).toBe(
			"commonjs",
		);
	});

	it("should resolve projectService for a roblox-scoped file without allowDefaultProject", async () => {
		expect.assertions(1);

		const projectDirectory = await prepareProject();
		const configs = await buildConfigs({
			outOfProjectFiles: [],
			parserOptionsTypeAware: { projectService: true },
			tsconfigPath: path.join(projectDirectory, "tsconfig.json"),
		});

		const eslint = new ESLint({
			cwd: projectDirectory,
			overrideConfig: configs,
			overrideConfigFile: true,
		});

		const parserOptions = await resolveParserOptions(
			eslint,
			path.join(projectDirectory, "src", "example.ts"),
		);

		expect(parserOptions["projectService"]).toBe(true);
	});
});
