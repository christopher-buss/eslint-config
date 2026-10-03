import { ESLint } from "eslint";
import type { Linter } from "eslint";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";

import { GLOB_SRC } from "../src/globs.ts";
import { isentinel } from "../src/index.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const MARKDOWN_FIXTURE = path.resolve(PROJECT_ROOT, "fixtures", "input", "markdown.md");

interface MarkdownVariant {
	name: string;
	options: Record<string, unknown>;
}

const variants: Array<MarkdownVariant> = [
	{
		name: "roblox-game",
		options: {
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			pnpm: false,
			spellCheck: false,
		},
	},
	{
		// Mirrors a real monorepo consumer (react + jest + scoped roblox)
		name: "monorepo",
		options: {
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			pnpm: false,
			react: true,
			roblox: {
				files: [`packages/*/*/${GLOB_SRC}`],
				filesTypeAware: [`packages/*/*/${GLOB_SRC}`],
			},
			spellCheck: false,
			test: { jest: true },
			type: "package",
		},
	},
];

/**
 * Whether a lint message is fatal: a parse failure, a missing plugin or a
 * crashed rule. Those carry a null ruleId.
 *
 * @param message - The lint message to classify.
 * @returns Whether the message is fatal.
 */
function isFatalMessage(message: Linter.LintMessage): boolean {
	return message.fatal === true || message.ruleId === null;
}

describe("oxlint hybrid markdown linting", () => {
	describe.for(variants)("$name", (variant: MarkdownVariant) => {
		it("should lint markdown files (and their fences) without fatal errors", async ({
			expect,
		}) => {
			expect.assertions(3);

			const composer = await isentinel({
				name: "test/hybrid-markdown",
				...variant.options,
				oxlint: true,
			});

			const eslint = new ESLint({
				cwd: PROJECT_ROOT,
				overrideConfig: [...composer],
				overrideConfigFile: true,
			});

			const markdown = await fs.readFile(MARKDOWN_FIXTURE, "utf8");
			const results = await eslint.lintText(markdown, {
				filePath: "docs/regression-sample.md",
			});

			// Fatal messages (parse failures, "could not find plugin",
			// crashed rules) have a null ruleId.
			const fatal = results.flatMap((result) => {
				return result.messages.filter(isFatalMessage).map((message) => message.message);
			});

			expect(fatal).toStrictEqual([]);

			// The oxlint-mapped rules must still fire inside code fences
			// (oxlint cannot lint markdown virtual files, so hybrid mode
			// keeps them in ESLint via the markdown-code sibling configs).
			const ruleIds = new Set(
				results.flatMap((result) => {
					return result.messages
						.map((message) => message.ruleId)
						.filter((ruleId) => ruleId !== null);
				}),
			);

			expect([...ruleIds]).toContain("no-var");
			expect([...ruleIds]).toContain("unicorn/name-replacements");
		}, 120_000);
	});
});
