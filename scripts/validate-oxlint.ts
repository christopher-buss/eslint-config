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

const config = isentinel({
	name: "test/oxlint-validation",
});

// Collect rules from top-level and all overrides, skipping "off" rules
// since those are harmless references to unimplemented oxlint rules
const configRules = new Set<string>();
for (const [key, value] of Object.entries(config.rules ?? {})) {
	if (value !== "off" && (!Array.isArray(value) || value[0] !== "off")) {
		configRules.add(key);
	}
}

for (const override of config.overrides ?? []) {
	for (const [key, value] of Object.entries(override.rules ?? {})) {
		if (value !== "off" && (!Array.isArray(value) || value[0] !== "off")) {
			configRules.add(key);
		}
	}
}

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
	// Core eslint rules have no prefix in config but are listed as eslint/rule
	// in --rules
	const lookup = rule.includes("/") ? rule : `eslint/${rule}`;
	if (!validRules.has(lookup)) {
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
