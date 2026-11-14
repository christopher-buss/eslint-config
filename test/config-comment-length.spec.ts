import stylistic from "@stylistic/eslint-plugin";

import { ESLint } from "eslint";
import path from "node:path";
import { describe, it } from "vitest";

import { toml } from "../src/eslint/configs/toml.ts";
import { yaml } from "../src/eslint/configs/yaml.ts";
import type { TypedFlatConfigItem } from "../src/eslint/types.ts";

const RULE = "flawless/max-comment-length";

const LANGUAGES = [
	{ factory: toml, file: "comments.toml", value: (key: string) => `${key} = 1` },
	{ factory: yaml, file: "comments.yaml", value: (key: string) => `${key}: 1` },
] as const;

/**
 * Lints a snippet against the preset's YAML or TOML configs.
 *
 * @param configs - The configs from the language's factory.
 * @param file - The virtual file name.
 * @param code - The source.
 * @returns The lines the comment word limit reported.
 */
async function lint(
	configs: Array<TypedFlatConfigItem>,
	file: string,
	code: string,
): Promise<Array<number>> {
	const eslint = new ESLint({
		overrideConfig: [{ plugins: { style: stylistic } }, ...configs],
		overrideConfigFile: true,
	});
	const [result] = await eslint.lintText(code, {
		filePath: path.join(import.meta.dirname, file),
	});

	return (result?.messages ?? [])
		.filter((message) => message.ruleId === RULE)
		.map((message) => message.line);
}

function comment(words: number): string {
	return `# ${Array.from({ length: words }).fill("word").join(" ")}`;
}

describe.for(LANGUAGES)("$file max-comment-length", ({ factory, file, value }) => {
	it("should limit comments to 50 words with anti-slop", async ({ expect }) => {
		expect.assertions(1);

		const code = [value("a"), comment(50), value("b"), "", comment(51), value("c"), ""].join(
			"\n",
		);

		await expect(lint(await factory({ antiSlop: true }), file, code)).resolves.toStrictEqual([
			5,
		]);
	});

	it("should not limit comments without anti-slop", async ({ expect }) => {
		expect.assertions(1);

		const code = [value("a"), comment(51), value("b"), ""].join("\n");

		await expect(lint(await factory(), file, code)).resolves.toStrictEqual([]);
	});
});
