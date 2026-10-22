/**
 * Formatter parity: `formatter: "standalone"` (ESLint lints, oxfmt formats)
 * must write the same bytes as `formatter: "eslint"` (oxfmt runs as an ESLint
 * rule). Each scenario runs the real tools over a scratch project in both
 * modes; the eslint-mode tree is the committed reference under
 * `fixtures/parity/output`.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

import { runMode } from "./harness.ts";
import { changedFiles, PARITY_FIXTURES, serializeTree } from "./project.ts";
import type { Scenario } from "./project.ts";

const PACKAGE = '{ roblox: false, type: "package" }';

/**
 * In eslint mode, one fix pass merges oxfmt's import sort with
 * `import/no-duplicates`, and a comment above a merged import is kept twice.
 * Standalone oxfmt sorts once, after ESLint, and keeps it once.
 */
const IMPORT_FIX_ORDER = {
	files: ["typescript.ts"],
	reason: "eslint mode duplicates a comment above a merged import",
};

function typed(base: string): string {
	return `{
		...${base},
		typescript: {
			parserOptionsTypeAware: {
				projectService: {
					allowDefaultProject: ["*.ts", "*.tsx"],
					defaultProject: "_tsconfig.lint.json",
				},
				tsconfigRootDir: import.meta.dirname,
			},
			tsconfigPath: \`\${import.meta.dirname}/_tsconfig.lint.json\`,
		},
	}`;
}

const ALL_FORMATTERS_OFF =
	"{ css: false, graphql: false, html: false, json: false, markdown: false, yaml: false }";

const OXFMTRC = fs.readFileSync(
	path.join(PARITY_FIXTURES, "scenarios", "oxfmtrc", ".oxfmtrc.json"),
	"utf8",
);

const scenarios: Array<Scenario> = [
	// File types, with no option source.
	{ name: "none", eslint: PACKAGE },
	{
		name: "component-exts",
		eslint: `{ ...${PACKAGE}, componentExts: ["vue"] }`,
		// Stands in for the framework parser a project with components adds.
		eslintConfigs:
			'{ files: ["**/*.vue"], languageOptions: { parser: parserPlain }, rules: { "ts/consistent-type-imports": "off" } }',
		oxfmt: '{ componentExts: ["vue"] }',
	},
	{
		name: "crlf",
		crlf: [
			"ts.ts",
			"widths.ts",
			"markdown.md",
			"data.json",
			"yaml.yaml",
			"style.css",
			"toml.toml",
		],
		eslint: PACKAGE,
	},
	// The repository's own fixtures, type-aware, as `fixtures.spec.ts` lints
	// them.
	{
		name: "package",
		eslint: typed(PACKAGE),
		input: "fixtures/input",
		knownDifference: IMPORT_FIX_ORDER,
	},
	{
		name: "roblox-game",
		eslint: typed('{ roblox: true, type: "game" }'),
		input: "fixtures/input",
		knownDifference: IMPORT_FIX_ORDER,
	},

	// Option sources.
	{ name: "prettierrc-root", eslint: PACKAGE },
	{ name: "prettierrc-overrides", eslint: PACKAGE },
	{ name: "editorconfig", eslint: PACKAGE },
	{ name: "oxfmtrc", eslint: PACKAGE, eslintOnly: [".oxfmtrc.json"], oxfmt: OXFMTRC },
	{
		name: "oxfmt-config",
		eslint: PACKAGE,
		oxfmt: `{
			ignorePatterns: ["ignored/**"],
			overrides: [
				{ files: ["**/*.md"], options: { printWidth: 70 } },
				{ files: ["docs/**/*.md"], options: { printWidth: 100 } },
				{ files: ["**/*.json"], options: { printWidth: 40 } },
			],
			printWidth: 90,
			semi: false,
		}`,
		oxfmtInBoth: true,
	},
	{ name: "nested-oxfmtrc", eslint: PACKAGE },
	{
		name: "factory-format-options",
		eslint: `{
			...${PACKAGE},
			formatters: {
				oxfmtOptions: { semi: false },
				prettierOptions: { printWidth: 80, tabWidth: 2 },
			},
		}`,
		oxfmt: "{ printWidth: 80, semi: false, tabWidth: 2 }",
	},
	{
		name: "json-use-spaces",
		eslint: `{ ...${PACKAGE}, formatters: { prettierOptions: { useTabs: false } } }`,
		oxfmt: "{ useTabs: false }",
	},
	{
		name: "json-single-quote",
		eslint: `{ ...${PACKAGE}, formatters: { prettierOptions: { singleQuote: true } } }`,
		oxfmt: "{ singleQuote: true }",
	},
	{
		name: "json-no-bracket-spacing",
		eslint: `{ ...${PACKAGE}, formatters: { prettierOptions: { bracketSpacing: false } } }`,
		oxfmt: "{ bracketSpacing: false }",
	},
	{
		name: "jsdoc-print-width",
		eslint: `{ ...${PACKAGE}, formatters: { prettierOptions: { jsdocPrintWidth: 100 } } }`,
		standaloneFiles: { ".prettierrc": '{ "jsdocPrintWidth": 100 }\n' },
	},
	{
		name: "formatters-partial",
		eslint: `{ ...${PACKAGE}, formatters: { css: false, markdown: false, yaml: false } }`,
		oxfmt: "{ formatters: { css: false, markdown: false, yaml: false } }",
	},
	{
		name: "formatters-off-each",
		eslint: `{ ...${PACKAGE}, formatters: ${ALL_FORMATTERS_OFF} }`,
		oxfmt: `{ formatters: ${ALL_FORMATTERS_OFF} }`,
	},
	{
		name: "formatters-false",
		eslint: `{ ...${PACKAGE}, formatters: false }`,
		oxfmt: "{ formatters: false }",
	},
	{ name: "stylistic-false", eslint: `{ ...${PACKAGE}, stylistic: false }`, oxfmt: null },
	{ name: "max-len", eslint: `{ ...${PACKAGE}, stylistic: { maxLen: 80 } }` },
	{
		name: "user-ignores",
		eslint: `{ ...${PACKAGE}, ignores: ["ignored/**"] }`,
		oxfmt: '{ ignorePatterns: ["ignored/**"] }',
	},
	{
		name: "gitignore",
		eslint: PACKAGE,
		files: { ".gitignore": "gitignored/\n" },
		git: true,
	},
	{ name: "subfolder", cwd: "app", eslint: PACKAGE },

	// Hybrid mode: oxlint formats JS/TS in eslint mode.
	{ name: "oxlint", eslint: `{ ...${PACKAGE}, oxlint: true }`, oxlint: true },
];

describe.concurrent("formatter parity", () => {
	it.for(scenarios)("$name", async (scenario, { expect }) => {
		const [eslintRun, standaloneRun] = await Promise.allSettled([
			runMode(scenario, "eslint"),
			runMode(scenario, "standalone"),
		]);
		if (eslintRun.status === "rejected") {
			throw eslintRun.reason;
		}

		const eslint = eslintRun.value;
		await expect
			.soft(serializeTree(eslint.tree))
			.toMatchFileSnapshot(path.join(PARITY_FIXTURES, "output", `${scenario.name}.txt`));

		if (standaloneRun.status === "rejected") {
			throw standaloneRun.reason;
		}

		const standalone = standaloneRun.value;
		expect(changedFiles(eslint.tree, standalone.tree)).toStrictEqual(
			scenario.knownDifference?.files ?? [],
		);
		if (scenario.knownDifference) {
			await expect(serializeTree(standalone.tree)).toMatchFileSnapshot(
				path.join(PARITY_FIXTURES, "output", `${scenario.name}.standalone.txt`),
			);
		} else {
			expect(standalone.tree).toStrictEqual(eslint.tree);
		}

		expect(standalone.fatal).toStrictEqual(eslint.fatal);
	});
});
