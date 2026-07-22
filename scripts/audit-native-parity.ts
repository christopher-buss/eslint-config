import { ESLint } from "eslint";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { isentinel as eslintIsentinel } from "../src/eslint/index.ts";
import type { OptionsConfig } from "../src/eslint/types.ts";
import { isRecord } from "../src/guards.ts";
import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import {
	isTsCoreCounterpartRule,
	oxlintRuleMapping,
	translateRuleToOxlint,
} from "../src/rules/oxlint-mapping.ts";

/**
 * Factory options for the ESLint side; `ignores` is dropped to fit the factory
 * overloads.
 */
type EslintAuditOptions = Omit<OptionsConfig, "ignores">;

/** A single oxlint JSON diagnostic, reduced to the fields this audit reads. */
interface OxlintDiagnostic {
	code: string;
	filename: string;
	labels: Array<{ span: { line: number } }>;
}

/**
 * Whether a parsed oxlint diagnostic carries the fields this audit reads.
 *
 * @param value - A parsed diagnostic element.
 * @returns Whether the value is a usable diagnostic.
 */
function isOxlintDiagnostic(value: unknown): value is OxlintDiagnostic {
	return (
		isRecord(value) &&
		typeof value["code"] === "string" &&
		typeof value["filename"] === "string" &&
		Array.isArray(value["labels"])
	);
}

// Empirically diff oxlint's native (Rust) rule implementations against the real
// ESLint plugin rule they replace in hybrid mode, for every rule mapped
// "native" in src/rules/oxlint-mapping.ts. Runs the full oxlint factory config
// and the full ESLint factory config (type-aware parsing disabled, since native
// rules never need type information) over a corpus, then compares per-rule
// (file, line) hit sets. Identical hits are native-parity safe; divergent hits
// are candidates to demote to a jsPlugin. Re-run after an oxlint bump.
//
// Usage: node scripts/audit-native-parity.ts [corpusDir]
// corpusDir defaults to this repo's own src; point it at a Flux worktree to
// widen the corpus.

const OXLINT_CODE = /^([\w@-]+)\((.+)\)$/;

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const oxlintBinary = path.join(
	rootDirectory,
	"node_modules",
	".bin",
	isWindows ? "oxlint.CMD" : "oxlint",
);

/** A single rule hit, normalized to a short path and line for comparison. */
interface Hit {
	file: string;
	line: number;
}

/** Where each engine looks for files, under a shared scratch directory. */
interface Corpus {
	globs: Array<string>;
	scratch: string;
	targets: Array<string>;
}

interface Variant {
	eslintOptions: EslintAuditOptions;
	label: string;
	oxlintOptions: Parameters<typeof oxlintIsentinel>[0];
}

/**
 * Reduce an absolute path to `parentDir/basename`. A bare basename collides
 * across the repo (for example `src/eslint/factory.ts` and
 * `src/oxlint/factory.ts`), which would manufacture false divergence.
 *
 * @param filePath - The absolute path reported by either tool.
 * @returns A short, collision-resistant identifier.
 */
function shortPath(filePath: string): string {
	return `${path.basename(path.dirname(filePath))}/${path.basename(filePath)}`;
}

/**
 * Normalize an oxlint JSON diagnostic code (`scope(rule)`) into the identifier
 * shape {@link translateRuleToOxlint} produces: bare for the `eslint` scope,
 * `scope/rule` otherwise.
 *
 * @param code - The raw `.code` field from an oxlint JSON diagnostic.
 * @returns The normalized identifier.
 */
function normalizeOxlintCode(code: string): string {
	const match = OXLINT_CODE.exec(code);
	if (match === null) {
		return code;
	}

	const scope = match[1] ?? "";
	const ruleName = match[2] ?? "";
	return scope === "eslint" ? ruleName : `${scope}/${ruleName}`;
}

/**
 * Canonical rules mapped `"native"`, excluding bare TypeScript-extension
 * counterparts that collapse onto the same oxlint core rule as their `ts/`
 * sibling (the bare rule is always disabled in `.ts` files, so it never emits).
 *
 * @returns The sorted native rule names.
 */
function nativeRules(): Array<string> {
	return Object.entries(oxlintRuleMapping)
		.filter(([rule, target]) => target === "native" && !isTsCoreCounterpartRule(rule))
		.map(([rule]) => rule)
		.sort();
}

/**
 * Create a scratch directory with a `node_modules` junction to this repo.
 *
 * @returns The scratch directory path.
 */
function createScratch(): string {
	const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "native-parity-"));
	fs.symlinkSync(
		path.join(rootDirectory, "node_modules"),
		path.join(scratch, "node_modules"),
		"junction",
	);
	return scratch;
}

function addHit(hits: Map<string, Array<Hit>>, identifier: string, hit: Hit): void {
	const list = hits.get(identifier) ?? [];
	list.push(hit);
	hits.set(identifier, list);
}

/**
 * Run oxlint over the targets with a generated factory config, collecting hits
 * keyed by normalized identifier.
 *
 * @param scratch - Scratch directory the `.oxlintrc.json` is written into.
 * @param options - Options passed to the oxlint factory.
 * @param targets - Absolute paths to lint.
 * @returns Hits keyed by normalized oxlint identifier.
 */
function runOxlint(
	scratch: string,
	options: Parameters<typeof oxlintIsentinel>[0],
	targets: Array<string>,
): Map<string, Array<Hit>> {
	const config = oxlintIsentinel(options);
	fs.writeFileSync(path.join(scratch, ".oxlintrc.json"), JSON.stringify(config, undefined, "\t"));

	const result = spawnSync(
		oxlintBinary,
		["-c", ".oxlintrc.json", "--disable-nested-config", "-f", "json", ...targets],
		{ cwd: scratch, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: isWindows },
	);

	const parsed: unknown = JSON.parse(result.stdout);
	const diagnostics =
		isRecord(parsed) && Array.isArray(parsed["diagnostics"]) ? parsed["diagnostics"] : [];

	const hits = new Map<string, Array<Hit>>();
	for (const diagnostic of diagnostics) {
		if (!isOxlintDiagnostic(diagnostic)) {
			continue;
		}

		const identifier = normalizeOxlintCode(diagnostic.code);
		const line = diagnostic.labels[0]?.span.line ?? 0;
		addHit(hits, identifier, { file: shortPath(diagnostic.filename), line });
	}

	return hits;
}

/**
 * Run the ESLint factory config over the globs, collecting hits keyed by
 * canonical `ruleId`. Type-aware parsing is disabled so no tsconfig resolution
 * is needed; no native-mapped rule requires type information.
 *
 * @param options - Options passed to the ESLint factory.
 * @param globs - Absolute forward-slash glob patterns to lint.
 * @returns Hits keyed by canonical ESLint `ruleId`.
 */
async function runEslint(
	options: EslintAuditOptions,
	globs: Array<string>,
): Promise<Map<string, Array<Hit>>> {
	const config = await eslintIsentinel({
		...options,
		name: "audit-native-parity",
		typescript: {
			...(isRecord(options.typescript) ? options.typescript : {}),
			typeAware: false,
		},
	});

	const eslint = new ESLint({
		cwd: rootDirectory,
		overrideConfig: config,
		overrideConfigFile: true,
	});
	const results = await eslint.lintFiles(globs);

	const hits = new Map<string, Array<Hit>>();
	for (const result of results) {
		for (const message of result.messages) {
			if (message.ruleId !== null) {
				addHit(hits, message.ruleId, {
					file: shortPath(result.filePath),
					line: message.line,
				});
			}
		}
	}

	return hits;
}

function hitKey(hit: Hit): string {
	return `${hit.file}:${hit.line}`;
}

/**
 * Compare a rule's ESLint hits against its translated oxlint hits.
 *
 * @param rule - The canonical native rule name.
 * @param eslintHits - ESLint hits keyed by canonical rule.
 * @param oxlintHits - Oxlint hits keyed by normalized identifier.
 * @returns The eslint-only and oxlint-only hit lists.
 */
function diffRule(
	rule: string,
	eslintHits: Map<string, Array<Hit>>,
	oxlintHits: Map<string, Array<Hit>>,
): { eslintOnly: Array<Hit>; oxlintOnly: Array<Hit> } {
	const left = eslintHits.get(rule) ?? [];
	const right = oxlintHits.get(translateRuleToOxlint(rule)) ?? [];
	const leftKeys = new Set(left.map(hitKey));
	const rightKeys = new Set(right.map(hitKey));
	return {
		eslintOnly: left.filter((hit) => !rightKeys.has(hitKey(hit))),
		oxlintOnly: right.filter((hit) => !leftKeys.has(hitKey(hit))),
	};
}

const baseOptions = {
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	spellCheck: false,
} as const;

const variants: Array<Variant> = [
	{
		eslintOptions: { ...baseOptions },
		label: "roblox-game",
		oxlintOptions: { ...baseOptions, name: "audit" },
	},
	{
		eslintOptions: { ...baseOptions, roblox: false, type: "package" },
		label: "package",
		oxlintOptions: { ...baseOptions, name: "audit", roblox: false, type: "package" },
	},
];

/**
 * Audit one variant, printing each divergent native rule.
 *
 * @param variant - The factory options and label to audit.
 * @param rules - The canonical native rules to check.
 * @param corpus - The scratch directory, oxlint targets and ESLint globs.
 * @returns The native rules that diverged in this variant.
 */
async function auditVariant(
	variant: Variant,
	rules: Array<string>,
	corpus: Corpus,
): Promise<Array<string>> {
	const oxlint = runOxlint(corpus.scratch, variant.oxlintOptions, corpus.targets);
	const eslint = await runEslint(variant.eslintOptions, corpus.globs);

	const divergent: Array<string> = [];
	for (const rule of rules) {
		const { eslintOnly, oxlintOnly } = diffRule(rule, eslint, oxlint);
		if (eslintOnly.length === 0 && oxlintOnly.length === 0) {
			continue;
		}

		divergent.push(rule);
		const example = [...eslintOnly, ...oxlintOnly][0];
		console.log(
			`DIVERGENT ${rule} -> ${translateRuleToOxlint(rule)} [${variant.label}]: ` +
				`eslintOnly=${eslintOnly.length} oxlintOnly=${oxlintOnly.length} ` +
				`(e.g. ${example ? hitKey(example) : "?"})`,
		);
	}

	return divergent;
}

async function main(): Promise<void> {
	const corpusDirectory = path.resolve(process.argv[2] ?? path.join(rootDirectory, "src"));
	const targets = [corpusDirectory, path.join(rootDirectory, "test")];
	const corpus: Corpus = {
		globs: targets.map((directory) => `${directory.split(path.sep).join("/")}/**/*.{ts,tsx}`),
		scratch: createScratch(),
		targets,
	};
	const rules = nativeRules();

	console.log(`Auditing ${rules.length} native-mapped rules over ${corpusDirectory}\n`);
	const divergent: Array<string> = [];
	for (const variant of variants) {
		divergent.push(...(await auditVariant(variant, rules, corpus)));
	}

	fs.rmSync(corpus.scratch, { force: true, recursive: true });

	const unique = [...new Set(divergent)];
	unique.sort();
	console.log(
		unique.length === 0
			? "\nNo native/plugin divergence observed; all native mappings are parity-safe."
			: `\nDivergent native rules (review for demotion): ${unique.join(", ")}`,
	);
}

await main();
