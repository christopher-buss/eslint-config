import type { Linter, Rule } from "eslint";
import { ESLint } from "eslint";
import { describe, it } from "vitest";

import { oxfmtMarkdownCode } from "../src/eslint/oxfmt-markdown-code.ts";

/** Reports a virtual file, the kind eslint-plugin-oxfmt skips. */
const reportsVirtual: Rule.RuleModule = {
	create(context) {
		return {
			Program(node) {
				if (context.filename !== context.physicalFilename) {
					context.report({ message: "virtual", node });
				}
			},
		};
	},
	meta: { schema: [], type: "layout" },
};

/** Hands the whole file over as one `0.ts` code block. */
const oneBlock: Linter.Processor = {
	postprocess: (messages) => messages.flat(),
	preprocess: (text) => [{ filename: "0.ts", text }],
	supportsAutofix: true,
};

async function messagesFor(filePath: string): Promise<Array<string>> {
	const plugin = oxfmtMarkdownCode({ rules: { oxfmt: reportsVirtual } });
	const eslint = new ESLint({
		overrideConfig: [
			{ files: ["**/*.md", "**/*.vue"], processor: oneBlock },
			{ files: ["**/*.ts"], plugins: { oxfmt: plugin }, rules: { "oxfmt/oxfmt": "error" } },
		],
		overrideConfigFile: true,
	});
	const [result] = await eslint.lintText("a = 1;", { filePath });
	return result!.messages.map(({ message }) => message);
}

describe("oxfmtMarkdownCode", () => {
	it("hands the rule Markdown code blocks as real files", async ({ expect }) => {
		expect.assertions(1);

		await expect(messagesFor("docs/a.md")).resolves.toStrictEqual([]);
	});

	it("keeps the virtual files of other processors virtual", async ({ expect }) => {
		expect.assertions(1);

		await expect(messagesFor("src/a.vue")).resolves.toStrictEqual(["virtual"]);
	});

	it("leaves real files as they are", async ({ expect }) => {
		expect.assertions(1);

		await expect(messagesFor("src/a.ts")).resolves.toStrictEqual([]);
	});
});
