import stylistic from "@stylistic/eslint-plugin";

import { ESLint } from "eslint";
import path from "node:path";
import { describe, it } from "vitest";

import { yaml } from "../src/eslint/configs/yaml.ts";
import type { OptionsFormatters, OptionsStylistic } from "../src/eslint/types.ts";

const VIRTUAL_FILE = path.join(import.meta.dirname, "max-len.yaml");

/**
 * Lints a YAML snippet against the preset's YAML configs.
 *
 * @param code - The YAML source.
 * @param options - The options passed to the YAML config factory.
 * @returns The lines `style/max-len` reported.
 */
async function lint(
	code: string,
	options: OptionsFormatters & OptionsStylistic = {},
): Promise<Array<number>> {
	const eslint = new ESLint({
		overrideConfig: [{ plugins: { style: stylistic } }, ...(await yaml(options))],
		overrideConfigFile: true,
	});
	const [result] = await eslint.lintText(code, { filePath: VIRTUAL_FILE });

	return (result?.messages ?? [])
		.filter((message) => message.ruleId === "style/max-len")
		.map((message) => message.line);
}

function comment(length: number): string {
	return `# ${"a".repeat(length - 2)}`;
}

function value(length: number): string {
	return `k${String(length).padStart(3, "0")}: ${"b".repeat(length - 6)}`;
}

describe("yaml max-len", () => {
	it("should limit comments to 80 columns and other lines to 100", async ({ expect }) => {
		expect.assertions(1);

		const code = [comment(80), comment(81), value(100), value(101), ""].join("\n");

		await expect(lint(code)).resolves.toStrictEqual([2, 4]);
	});

	it("should ignore lines that contain a URL", async ({ expect }) => {
		expect.assertions(1);

		const code = `# https://example.com/${"c".repeat(100)}\n`;

		await expect(lint(code)).resolves.toStrictEqual([]);
	});

	it("should ignore action references, which cannot wrap", async ({ expect }) => {
		expect.assertions(1);

		const reference = `owner/repo/.github/workflows/release.yml@${"d".repeat(40)} # v1.3.0`;
		const code = [
			"jobs:",
			"  release:",
			`    uses: ${reference}`,
			"    steps:",
			`      - uses: ${reference}`,
			"",
		].join("\n");

		await expect(lint(code)).resolves.toStrictEqual([]);
	});

	it("should read the widths from the formatter options", async ({ expect }) => {
		expect.assertions(1);

		const code = [comment(61), value(91), ""].join("\n");

		await expect(
			lint(code, { prettierOptions: { jsdocPrintWidth: 60, printWidth: 90 } }),
		).resolves.toStrictEqual([1, 2]);
	});

	it("should not limit lines without stylistic rules", async ({ expect }) => {
		expect.assertions(1);

		const code = [comment(81), value(101), ""].join("\n");

		await expect(lint(code, { stylistic: false })).resolves.toStrictEqual([]);
	});
});
