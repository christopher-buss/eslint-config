import { ESLint } from "eslint";
import path from "node:path";
import { describe, it } from "vitest";

import { comments } from "../src/eslint/configs/comments.ts";

const RULE = "eslint-comments/require-description";

/**
 * Lints a snippet against the preset's comments configs.
 *
 * @param code - The JS source.
 * @returns The lines `require-description` reported.
 */
async function lint(code: string): Promise<Array<number>> {
	const eslint = new ESLint({
		overrideConfig: await comments({ stylistic: false }),
		overrideConfigFile: true,
	});
	const [result] = await eslint.lintText(code, {
		filePath: path.join(import.meta.dirname, "file.js"),
	});

	return (result?.messages ?? [])
		.filter((message) => message.ruleId === RULE)
		.map((message) => message.line);
}

describe("coverage directives require a description", () => {
	it.for([
		"// cov ignore next",
		"// cov ignore if",
		"/* cov ignore else */",
		"/* v8 ignore next */",
		"/* c8 ignore next */",
		"/* istanbul ignore next */",
	])("should report %s", async (directive, { expect }) => {
		expect.assertions(1);

		await expect(lint(`${directive}\nfoo();\n`)).resolves.toStrictEqual([1]);
	});

	it.for([
		"// cov ignore next -- unreachable from the client",
		"/* v8 ignore next -- @preserve */",
		"/* istanbul ignore next -- defensive */",
	])("should accept %s", async (directive, { expect }) => {
		expect.assertions(1);

		await expect(lint(`${directive}\nfoo();\n`)).resolves.toStrictEqual([]);
	});

	it("should not treat prose that starts with a tool name as a directive", async ({ expect }) => {
		expect.assertions(1);

		const code = "// v8 engine quirk\n// cov is short for coverage\nfoo();\n";

		await expect(lint(code)).resolves.toStrictEqual([]);
	});
});
