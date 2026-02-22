import { execSync } from "node:child_process";
import process from "node:process";

import { isentinel } from "../src/oxlint";

const output = execSync("pnpm oxlint --rules", { encoding: "utf-8" });

// Parse "| rule-name | source |" rows from the markdown table
const validRules = new Set<string>();
for (const line of output.split("\n")) {
	const match = /^\|\s+([\w-]+)\s+\|\s+(\w+)/.exec(line);
	if (match) {
		const [, rule, source] = match;
		validRules.add(`${source}/${rule}`);
	}
}

const config = isentinel();
const configRules = Object.keys(config.rules ?? {});

// jsPlugin prefixes — rules from these plugins can't be validated against
// oxlint's native rule list since they're loaded at runtime
const jsPluginPrefixes = new Set(
	(config.jsPlugins ?? []).map((plugin) => (typeof plugin === "string" ? plugin : plugin.name)),
);

let nativeCount = 0;
let jsPluginCount = 0;
let invalid = 0;

for (const rule of configRules) {
	const prefix = rule.split("/")[0];
	if (prefix !== undefined && jsPluginPrefixes.has(prefix)) {
		jsPluginCount++;
		continue;
	}

	nativeCount++;
	if (!validRules.has(rule)) {
		console.error(`Unknown oxlint rule: ${rule}`);
		invalid++;
	}
}

if (invalid > 0) {
	console.error(`\n${invalid} unknown rule(s) found.`);
	process.exit(1);
} else {
	console.log(`Validated ${nativeCount} native rules, skipped ${jsPluginCount} jsPlugin rules.`);
}
