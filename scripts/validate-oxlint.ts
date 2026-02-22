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

let invalid = 0;
for (const rule of configRules) {
	if (!validRules.has(rule)) {
		console.error(`Unknown oxlint rule: ${rule}`);
		invalid++;
	}
}

if (invalid > 0) {
	console.error(`\n${invalid} unknown rule(s) found.`);
	process.exit(1);
} else {
	console.log(`All ${configRules.length} rules are valid oxlint rules.`);
}
