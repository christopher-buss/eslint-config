/**
 * Formatter parity: `formatter: "standalone"` (ESLint lints, oxfmt formats)
 * must write the same bytes as `formatter: "eslint"` (oxfmt runs as an ESLint
 * rule). Each scenario runs the real tools over a scratch project in both
 * modes; the eslint-mode tree is the committed reference under
 * `fixtures/parity/output`.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, it } from "vitest";
import type { ExpectStatic } from "vitest";

import { runMode } from "./harness.ts";
import type { ModeResult } from "./harness.ts";
import { changedFiles, PARITY_FIXTURES, serializeTree } from "./project.ts";
import type { Scenario } from "./project.ts";

/** The prefix of every warning the preset prints. */
const PRESET_WARNING = "[@isentinel/eslint-config]";

const PACKAGE = '{ roblox: false, type: "package" }';

/**
 * In eslint mode, the oxfmt fix can win a pass over `import/no-duplicates`,
 * so imports are sorted before they merge. Standalone merges first, then
 * sorts. The comments above the merged import end in a different order.
 */
const IMPORT_FIX_ORDER = {
	files: ["typescript.ts"],
	reason: "comments above a merged import end in a different order",
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

/** Corpus files several scenarios copy. */
const TS_FILE = "ts.ts";
const NESTED_TS_FILE = "sub/nested.ts";
const MARKDOWN_FILE = "markdown.md";

/** Every JSON flavour, plus one TS file to show the option stays scoped. */
const JSON_FILES = [
	"data.json",
	"data.json5",
	"data.jsonc",
	"package.json",
	"plain.json5",
	"sub/nested.json",
	TS_FILE,
	"tsconfig.json",
];

/** The files the print-width and semi options visibly change. */
const WIDTH_FILES = ["data.json", MARKDOWN_FILE, TS_FILE, "widths.ts"];

const CRLF_FILES = [
	"data.json",
	MARKDOWN_FILE,
	"style.css",
	"toml.toml",
	TS_FILE,
	"widths.ts",
	"yaml.yaml",
];

const OXFMTRC = fs.readFileSync(
	path.join(PARITY_FIXTURES, "scenarios", "oxfmtrc", ".oxfmtrc.json"),
	"utf8",
);

const scenarios: Array<Scenario> = [
	// File types, with no option source.
	{ name: "none", eslint: PACKAGE },
	{
		name: "component-exts",
		corpus: ["component.vue", TS_FILE],
		eslint: `{ ...${PACKAGE}, componentExts: ["vue"] }`,
		// Stands in for the framework parser a project with components adds.
		eslintConfigs:
			'{ files: ["**/*.vue"], languageOptions: { parser: parserPlain }, rules: { "ts/consistent-type-imports": "off" } }',
		oxfmt: '{ componentExts: ["vue"] }',
		warns: true,
	},
	{
		name: "crlf",
		corpus: CRLF_FILES,
		crlf: CRLF_FILES,
		eslint: PACKAGE,
	},
	// The repository's own fixtures, type-aware, as `fixtures.spec.ts` lints
	// them.
	{
		name: "package",
		eslint: typed(PACKAGE),
		input: "fixtures/input",
		knownDifference: IMPORT_FIX_ORDER,
		typeAware: true,
	},
	{
		name: "roblox-game",
		eslint: typed('{ roblox: true, type: "game" }'),
		input: "fixtures/input",
		knownDifference: IMPORT_FIX_ORDER,
		typeAware: true,
	},

	// Option sources.
	{ name: "prettierrc-root", corpus: [...WIDTH_FILES, "yaml.yaml"], eslint: PACKAGE },
	{
		name: "prettierrc-overrides",
		corpus: [...WIDTH_FILES, NESTED_TS_FILE, "yaml.yaml"],
		eslint: PACKAGE,
		warns: true,
	},
	{
		name: "editorconfig",
		corpus: [...WIDTH_FILES, NESTED_TS_FILE],
		eslint: PACKAGE,
		warns: true,
	},
	{
		name: "oxfmtrc",
		corpus: [...WIDTH_FILES, "docs/guide.md", NESTED_TS_FILE],
		eslint: PACKAGE,
		eslintOnly: [".oxfmtrc.json"],
		oxfmt: OXFMTRC,
	},
	{
		name: "oxfmt-config",
		corpus: [...WIDTH_FILES, "docs/guide.md"],
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
	{
		name: "nested-oxfmtrc",
		corpus: ["sub/nested.json", "sub/nested.md", NESTED_TS_FILE, TS_FILE],
		eslint: PACKAGE,
	},
	{
		name: "factory-format-options",
		corpus: WIDTH_FILES,
		eslint: `{
			...${PACKAGE},
			formatters: {
				oxfmtOptions: { semi: false },
				prettierOptions: { printWidth: 80, tabWidth: 2 },
			},
		}`,
		oxfmt: "{ printWidth: 80, semi: false, tabWidth: 2 }",
		warns: true,
	},
	{ name: "json-editorconfig-spaces", corpus: JSON_FILES, eslint: PACKAGE },
	{ name: "json-prettierrc-spaces", corpus: JSON_FILES, eslint: PACKAGE },
	{
		name: "json-use-spaces",
		corpus: JSON_FILES,
		eslint: `{ ...${PACKAGE}, formatters: { prettierOptions: { useTabs: false } } }`,
		oxfmt: "{ useTabs: false }",
		warns: true,
	},
	{
		name: "json-single-quote",
		corpus: JSON_FILES,
		eslint: `{ ...${PACKAGE}, formatters: { prettierOptions: { singleQuote: true } } }`,
		oxfmt: "{ singleQuote: true }",
		warns: true,
	},
	{
		name: "json-no-bracket-spacing",
		corpus: JSON_FILES,
		eslint: `{ ...${PACKAGE}, formatters: { prettierOptions: { bracketSpacing: false } } }`,
		oxfmt: "{ bracketSpacing: false }",
		warns: true,
	},
	{
		name: "jsdoc-print-width",
		corpus: [TS_FILE],
		eslint: `{ ...${PACKAGE}, formatters: { prettierOptions: { jsdocPrintWidth: 100 } } }`,
		standaloneFiles: { ".prettierrc": '{ "jsdocPrintWidth": 100 }\n' },
		warns: true,
	},
	{
		name: "formatters-partial",
		eslint: `{ ...${PACKAGE}, formatters: { css: false, markdown: false, yaml: false } }`,
		oxfmt: "{ formatters: { css: false, markdown: false, yaml: false } }",
		warns: true,
	},
	{
		name: "formatters-off-each",
		eslint: `{ ...${PACKAGE}, formatters: ${ALL_FORMATTERS_OFF} }`,
		oxfmt: `{ formatters: ${ALL_FORMATTERS_OFF} }`,
		warns: true,
	},
	{
		name: "formatters-false",
		eslint: `{ ...${PACKAGE}, formatters: false }`,
		oxfmt: "{ formatters: false }",
		warns: true,
	},
	{
		name: "stylistic-false",
		eslint: `{ ...${PACKAGE}, stylistic: false }`,
		oxfmt: null,
	},
	{
		name: "max-len",
		corpus: WIDTH_FILES,
		eslint: `{ ...${PACKAGE}, stylistic: { maxLen: 80 } }`,
	},
	{
		name: "user-ignores",
		corpus: ["data.json", TS_FILE],
		eslint: `{ ...${PACKAGE}, ignores: ["ignored/**"] }`,
		oxfmt: '{ ignorePatterns: ["ignored/**"] }',
		warns: true,
	},
	{
		name: "gitignore",
		corpus: ["data.json", TS_FILE],
		eslint: PACKAGE,
		files: { ".gitignore": "gitignored/\n" },
		git: true,
	},
	{
		name: "subfolder",
		corpus: [MARKDOWN_FILE, TS_FILE, "widths.ts"],
		cwd: "app",
		eslint: PACKAGE,
	},

	// Hybrid mode: oxlint formats JS/TS in eslint mode.
	{
		name: "oxlint",
		corpus: [
			"cjs.cjs",
			"cts.cts",
			"data.json",
			"imports.ts",
			"js.js",
			"jsx.jsx",
			MARKDOWN_FILE,
			"mjs.mjs",
			"mts.mts",
			"package.json",
			"tagged.ts",
			TS_FILE,
			"tsx.tsx",
			"types.d.ts",
			"widths.ts",
		],
		eslint: `{ ...${PACKAGE}, oxlint: true }`,
		oxlint: true,
		warns: true,
	},
];

function compareModes(
	scenario: Scenario,
	eslint: ModeResult,
	standalone: ModeResult,
	expect: ExpectStatic,
): void {
	expect(changedFiles(eslint.tree, standalone.tree)).toStrictEqual(
		scenario.knownDifference?.files ?? [],
	);
	if (!scenario.knownDifference) {
		expect(standalone.tree).toStrictEqual(eslint.tree);
	}

	expect(standalone.fatal).toStrictEqual(eslint.fatal);
	if (scenario.warns !== true) {
		expect(eslint.warnings).not.toContain(PRESET_WARNING);
		expect(standalone.warnings).not.toContain(PRESET_WARNING);
	}
}

async function checkScenario(scenario: Scenario, expect: ExpectStatic): Promise<void> {
	const [eslintRun, standaloneRun] = await Promise.allSettled([
		runMode(scenario, "eslint"),
		runMode(scenario, "standalone"),
	]);
	if (eslintRun.status === "rejected") {
		throw eslintRun.reason;
	}

	await expect
		.soft(serializeTree(eslintRun.value.tree))
		.toMatchFileSnapshot(path.join(PARITY_FIXTURES, "output", `${scenario.name}.txt`));

	if (standaloneRun.status === "rejected") {
		throw standaloneRun.reason;
	}

	compareModes(scenario, eslintRun.value, standaloneRun.value, expect);
	if (scenario.knownDifference) {
		await expect(serializeTree(standaloneRun.value.tree)).toMatchFileSnapshot(
			path.join(PARITY_FIXTURES, "output", `${scenario.name}.standalone.txt`),
		);
	}
}

/** `PARITY_SHARD`: the shard, then the shard count. */
const SHARD_PATTERN = /^(\d+)\/(\d+)$/;

/**
 * The scenarios this run owns. `PARITY_SHARD=i/n` (CI) takes every n-th
 * scenario from the i-th, after sorting the type-aware ones first, so each
 * shard gets its share of the slowest scenarios. Unset, the run takes all.
 *
 * @returns The scenarios to run, type-aware first.
 */
function shardScenarios(): Array<Scenario> {
	const sorted = scenarios.toSorted(
		(a, b) => Number(b.typeAware ?? false) - Number(a.typeAware ?? false),
	);
	const shard = process.env["PARITY_SHARD"];
	if (shard === undefined || shard === "") {
		return sorted;
	}

	const match = SHARD_PATTERN.exec(shard);
	const index = Number(match?.[1]);
	const count = Number(match?.[2]);
	if (match === null || index < 1 || index > count) {
		throw new Error(`PARITY_SHARD must be "i/n" with 1 <= i <= n, got "${shard}"`);
	}

	return sorted.filter((_, position) => position % count === index - 1);
}

const owned = shardScenarios();

// Type-aware scenarios build TypeScript programs; run in parallel with the
// rest they have crashed ESLint natively on Windows, so there they run one by
// one. Elsewhere they run with the rest, first, as they take the most rounds.
if (process.platform === "win32") {
	describe("formatter parity (type-aware)", () => {
		it.for(owned.filter(({ typeAware }) => typeAware === true))(
			"$name",
			async (scenario, { expect }) => checkScenario(scenario, expect),
		);
	});

	describe.concurrent("formatter parity", () => {
		it.for(owned.filter(({ typeAware }) => typeAware !== true))(
			"$name",
			async (scenario, { expect }) => checkScenario(scenario, expect),
		);
	});
} else {
	describe.concurrent("formatter parity", () => {
		it.for(owned)("$name", async (scenario, { expect }) => checkScenario(scenario, expect));
	});
}
