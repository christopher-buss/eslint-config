import { describe, it } from "vitest";

import { isRecord } from "../src/guards.ts";
import { isentinel } from "../src/index.ts";
import type { TypedFlatConfigItem } from "../src/index.ts";

/**
 * Build the preset with type-aware linting on.
 *
 * @param roblox - Whether roblox-ts linting is on.
 * @returns The resolved flat config array.
 */
async function buildConfigs(roblox: boolean): Promise<Array<TypedFlatConfigItem>> {
	const composer = await isentinel({
		name: "test/out-of-project-files",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		pnpm: false,
		roblox,
		spellCheck: false,
		typescript: { tsconfigPath: "tsconfig.json" },
	});

	return [...composer];
}

/**
 * The `allowDefaultProject` globs of a named type-aware parser entry.
 *
 * @param configs - The resolved flat config items.
 * @param name - The name of the parser config entry.
 * @returns The entry's `allowDefaultProject`, or undefined when absent.
 */
function allowDefaultProjectOf(configs: Array<TypedFlatConfigItem>, name: string): unknown {
	const config = configs.find((item) => item.name === name);
	const parserOptions = config?.languageOptions?.["parserOptions"];
	const projectService = isRecord(parserOptions) ? parserOptions["projectService"] : undefined;
	return isRecord(projectService) ? projectService["allowDefaultProject"] : undefined;
}

describe("outOfProjectFiles default", () => {
	it("should leave root .ts files to the tsconfig outside roblox", async ({ expect }) => {
		expect.assertions(1);

		const configs = await buildConfigs(false);

		expect(
			allowDefaultProjectOf(configs, "isentinel/typescript/type-aware-parser"),
		).toStrictEqual(["*.js", ".*.js", ".*.ts"]);
	});

	it("should keep root .ts files out of project for roblox", async ({ expect }) => {
		expect.assertions(2);

		const configs = await buildConfigs(true);
		const expected = ["*.js", "*.ts", ".*.js", ".*.ts"];

		expect(
			allowDefaultProjectOf(configs, "isentinel/typescript/type-aware-parser"),
		).toStrictEqual(expected);
		expect(allowDefaultProjectOf(configs, "isentinel/roblox/type-aware-parser")).toStrictEqual(
			expected,
		);
	});
});
