import { ESLint } from "eslint";
import type { Linter } from "eslint";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";

import { isentinel } from "../src/index.ts";
import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import { fatalMessages, FIXTURES_TEMP } from "./helpers.ts";
import { OXLINT_FIXTURES_TEMP, runOxlint, OXLINT_TIMEOUT as timeout } from "./oxlint-run.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const COVERAGE_INPUT = path.resolve(PROJECT_ROOT, "fixtures", "unicorn-coverage");

const TSCONFIG_NAME = "tsconfig.json";

const TSCONFIG = {
	compilerOptions: {
		lib: ["ESNext", "DOM", "DOM.AsyncIterable"],
		module: "ESNext",
		moduleResolution: "bundler",
		noEmit: true,
		skipLibCheck: true,
		strict: true,
		target: "ESNext",
		types: ["node"],
	},
	include: ["**/*.ts"],
};

interface Variant {
	group: string;
	label: string;
	roblox: boolean;
}

/**
 * Each fixture group is linted under the project variant its rules target:
 * `all` under both, `non-roblox` and `node` only outside the roblox scope.
 */
const VARIANTS: Array<Variant> = [
	{ group: "all", label: "all-roblox", roblox: true },
	{ group: "all", label: "all-ts", roblox: false },
	{ group: "non-roblox", label: "non-roblox-ts", roblox: false },
	{ group: "node", label: "node-ts", roblox: false },
];

/**
 * Rules that report on the whole file, so they overlap every candidate in the
 * file rather than the pattern under test.
 */
const WHOLE_FILE_RULES = new Set(["max-classes-per-file"]);

interface Range {
	end: number;
	start: number;
}

/** The rules that report on the lines a candidate rule reports on. */
type CoverageReport = Record<string, Array<string>>;

/**
 * The candidate rule a fixture exercises. A fixture is named after its rule,
 * with an optional `.variant` suffix for a second case of the same rule.
 *
 * @param file - The fixture file name.
 * @returns The prefixed rule name.
 */
function candidateRule(file: string): string {
	return `unicorn/${file.slice(0, file.indexOf("."))}`;
}

/**
 * Copy one fixture group into a fresh directory.
 *
 * @param group - The fixture group folder name.
 * @param directory - The target directory.
 * @returns The fixture file names.
 */
async function prepare(group: string, directory: string): Promise<Array<string>> {
	await fs.rm(directory, { force: true, recursive: true });
	await fs.cp(path.join(COVERAGE_INPUT, group), directory, { recursive: true });
	await fs.writeFile(path.join(directory, TSCONFIG_NAME), JSON.stringify(TSCONFIG));

	const files = await fs.readdir(directory);
	return files.filter((file) => file.endsWith(".ts"));
}

/**
 * The full preset, plus one override per fixture that turns on only that
 * fixture's candidate rule.
 *
 * @param directory - The fixture directory.
 * @param files - The fixture file names.
 * @param roblox - The project variant.
 * @returns The resolved flat config.
 */
async function buildConfig(
	directory: string,
	files: Array<string>,
	roblox: boolean,
): Promise<Array<Linter.Config>> {
	const composer = await isentinel({
		name: "test/unicorn-coverage",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		pnpm: false,
		roblox,
		spellCheck: false,
		typescript: {
			parserOptionsTypeAware: {
				projectService: true,
				tsconfigRootDir: directory,
			},
			tsconfigPath: path.join(directory, TSCONFIG_NAME),
		},
	});

	const candidates = files.map((file): Linter.Config => {
		return {
			files: [file],
			rules: { [candidateRule(file)]: "error" },
		};
	});

	return [...composer, ...candidates];
}

/**
 * Lint one fixture group with the full ESLint preset.
 *
 * @param variant - The fixture group and project variant.
 * @returns The lint results.
 * @rejects When a fixture produces a fatal message.
 */
async function lintWithEslint(variant: Variant): Promise<Array<ESLint.LintResult>> {
	const directory = path.join(FIXTURES_TEMP, `unicorn-coverage-${variant.label}`);
	const files = await prepare(variant.group, directory);

	const eslint = new ESLint({
		cwd: directory,
		overrideConfig: await buildConfig(directory, files, variant.roblox),
		overrideConfigFile: true,
	});
	const results = await eslint.lintFiles(files);

	const fatal = fatalMessages(results);
	if (fatal.length > 0) {
		throw new Error(`Fatal lint messages in ${variant.label}:\n${fatal.join("\n")}`);
	}

	return results;
}

/**
 * Lint one fixture group with the full oxlint preset.
 *
 * @param variant - The fixture group and project variant.
 * @returns The diagnostics as `file:line code` strings.
 */
async function lintWithOxlint(variant: Variant): Promise<Array<string>> {
	const directory = path.join(OXLINT_FIXTURES_TEMP, `unicorn-coverage-${variant.label}`);
	await prepare(variant.group, directory);

	const config = oxlintIsentinel({
		name: "test/unicorn-coverage",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		roblox: variant.roblox,
		spellCheck: false,
	});
	await fs.writeFile(
		path.join(directory, ".oxlintrc.json"),
		JSON.stringify(config, undefined, "\t"),
	);

	const diagnostics = runOxlint(directory, true);
	await fs.rm(directory, { force: true, recursive: true });

	return diagnostics;
}

/**
 * Whether a report on `line` falls inside any candidate range.
 *
 * @param ranges - The candidate rule's report ranges.
 * @param line - The line of the other report.
 * @param endLine - The end line of the other report.
 * @returns Whether the two overlap.
 */
function overlaps(ranges: Array<Range>, line: number, endLine = line): boolean {
	return ranges.some((range) => line <= range.end && endLine >= range.start);
}

/**
 * The oxlint rules that report inside the candidate ranges of one fixture.
 *
 * @param file - The fixture file name.
 * @param ranges - The candidate rule's report ranges.
 * @param diagnostics - The oxlint diagnostics for the whole group.
 * @returns The overlapping oxlint rule codes.
 */
function overlappingOxlintRules(
	file: string,
	ranges: Array<Range>,
	diagnostics: Array<string>,
): Array<string> {
	const rules: Array<string> = [];
	for (const diagnostic of diagnostics) {
		const groups = /^(?<name>[^:]+):(?<line>\d+) (?<code>.*)$/.exec(diagnostic)?.groups;
		if (
			groups !== undefined &&
			path.basename(groups["name"] ?? "") === file &&
			overlaps(ranges, Number(groups["line"]))
		) {
			rules.push(`oxlint:${groups["code"]}`);
		}
	}

	return rules;
}

/**
 * The other rules that report on the lines the candidate reports on.
 *
 * @param result - The ESLint result for one fixture.
 * @param oxlintDiagnostics - The oxlint diagnostics for the whole group.
 * @returns The overlapping rules, prefixed with the linter that ran them.
 */
function overlappingRules(
	result: ESLint.LintResult,
	oxlintDiagnostics: Array<string>,
): Array<string> {
	const file = path.basename(result.filePath);
	const candidate = candidateRule(file);

	const ranges = result.messages
		.filter((message) => message.ruleId === candidate)
		.map((message) => ({ end: message.endLine ?? message.line, start: message.line }));

	if (ranges.length === 0) {
		return ["<candidate did not fire>"];
	}

	const eslintRules = result.messages
		.filter((message) => {
			return (
				message.ruleId !== candidate &&
				!WHOLE_FILE_RULES.has(message.ruleId ?? "") &&
				overlaps(ranges, message.line, message.endLine)
			);
		})
		.map((message) => `eslint:${message.ruleId}`);

	const oxlintRules = overlappingOxlintRules(file, ranges, oxlintDiagnostics);

	return [...new Set([...eslintRules, ...oxlintRules])].sort();
}

// Each fixture holds the code a candidate unicorn rule reports. The snapshot
// lists every other preset rule (ESLint and oxlint) that reports on the same
// lines, so an empty list means the candidate adds coverage.
describe("unicorn candidate rule coverage", () => {
	it.for(VARIANTS)(
		"records the existing rules that overlap the $label fixtures",
		{ timeout },
		async (variant, { expect }) => {
			expect.assertions(1);

			const results = await lintWithEslint(variant);
			const oxlintDiagnostics = await lintWithOxlint(variant);

			const report: CoverageReport = {};
			for (const result of results) {
				report[path.basename(result.filePath, ".ts")] = overlappingRules(
					result,
					oxlintDiagnostics,
				);
			}

			expect(report).toMatchSnapshot();
		},
	);
});
