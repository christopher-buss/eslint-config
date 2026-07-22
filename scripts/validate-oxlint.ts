/**
 * Validates the oxlint factory output against the local oxlint binary's rule
 * list (`oxlint --rules`). Fails when a configured native rule does not exist
 * in the installed oxlint version.
 *
 * Runs under plain node (via `pnpm validate:oxlint`).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { isRecord } from "../src/guards.ts";
import { isentinel } from "../src/oxlint/index.ts";

interface OxlintRuleInfo {
	scope: string;
	type_aware: boolean;
	value: string;
}

/**
 * Whether a parsed `oxlint --rules` entry has the string fields this script
 * reads.
 *
 * @param value - A parsed array element.
 * @returns Whether the value is a usable rule info entry.
 */
function isOxlintRuleInfo(value: unknown): value is OxlintRuleInfo {
	return (
		isRecord(value) &&
		typeof value["scope"] === "string" &&
		typeof value["value"] === "string" &&
		typeof value["type_aware"] === "boolean"
	);
}

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binaryName = process.platform === "win32" ? "oxlint.CMD" : "oxlint";
const oxlintBinary = path.join(rootDirectory, "node_modules", ".bin", binaryName);

const output = execFileSync(oxlintBinary, ["--rules", "-f", "json"], {
	encoding: "utf8",
	shell: process.platform === "win32",
});
const parsedRuleList: unknown = JSON.parse(output);
if (!Array.isArray(parsedRuleList)) {
	throw new Error("Unexpected `oxlint --rules` output: expected a JSON array.");
}

const validRules = new Set<string>();
for (const rule of parsedRuleList) {
	if (isOxlintRuleInfo(rule)) {
		validRules.add(`${rule.scope}/${rule.value}`);
	}
}

if (validRules.size === 0) {
	console.warn("No rules from oxlint --rules, skipping validation.");
	process.exit(0);
}

const variants = [
	isentinel({ name: "validate/roblox-game" }),
	isentinel({
		name: "validate/package",
		eslintPlugin: true,
		react: true,
		roblox: false,
		test: { vitest: true },
		type: "package",
		typescript: { erasableOnly: true },
	}),
	isentinel({ name: "validate/jest", test: { jest: true } }),
];

// jsPlugin rule prefixes cannot be validated against the native rule list
const jsPluginPrefixes = new Set<string>();
const configRules = new Set<string>();

function collectRules(rules: Record<string, unknown> | undefined): void {
	const entries = Object.entries(rules ?? {});
	for (const [key, value] of entries) {
		if (value !== undefined) {
			configRules.add(key);
		}
	}
}

for (const config of variants) {
	const jsPlugins = config.jsPlugins ?? [];
	for (const jsPlugin of jsPlugins) {
		jsPluginPrefixes.add(typeof jsPlugin === "string" ? jsPlugin : jsPlugin.name);
	}

	collectRules(config.rules);

	const overrides = config.overrides ?? [];
	for (const override of overrides) {
		collectRules(override.rules);
	}
}

let nativeCount = 0;
let jsPluginCount = 0;
let invalid = 0;

for (const rule of configRules) {
	const prefix = rule.split("/", 1)[0];
	if (prefix !== undefined && jsPluginPrefixes.has(prefix)) {
		jsPluginCount += 1;
		continue;
	}

	nativeCount += 1;
	// Core eslint rules have no prefix in config but are listed as
	// `eslint/<rule>` in `--rules`.
	const lookup = rule.includes("/") ? rule : `eslint/${rule}`;
	if (!validRules.has(lookup)) {
		console.error(`Unknown oxlint rule: ${rule}`);
		invalid += 1;
	}
}

if (invalid > 0) {
	console.error(`\n${invalid} unknown rule(s) found.`);
	process.exit(1);
}

console.log(`Validated ${nativeCount} native rules, skipped ${jsPluginCount} jsPlugin rules.`);
