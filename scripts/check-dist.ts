/* eslint-disable unicorn/name-replacements -- "dist" is the build output directory, not an abbreviation. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexTypesPath = path.join(rootDirectory, "dist", "index.d.mts");
const contents = readFileSync(indexTypesPath, "utf8");

// The root ESLint bundle must not pull in oxlint type declarations. Match the
// oxlint type identifiers (Oxlint*, TypedOxlint* and the unprefixed re-exports)
// rather than the word "oxlint", which legitimately appears as the
// `oxlint?: boolean` option, plus any import/export from the "oxlint" module.
const oxlintTypePattern = /\b(?:Oxlint[A-Z]\w*|TypedOxlint\w*|DummyRuleMap|ExternalPluginEntry)\b/g;
const oxlintModulePattern = /(?:\bfrom|\bimport\()\s*["']oxlint["']/g;
const leaked = [
	...new Set([
		...Array.from(contents.matchAll(oxlintTypePattern), (match) => match[0]),
		...Array.from(contents.matchAll(oxlintModulePattern), (match) => match[0]),
	]),
].toSorted();

if (leaked.length > 0) {
	console.error(`[check-dist] dist/index.d.mts leaks oxlint references: ${leaked.join(", ")}`);
	process.exit(1);
}

console.log("[check-dist] dist/index.d.mts is free of oxlint references.");

// The lint runner launches every engine child through this file and has no
// fallback without it, so a build that drops the entry ships a runner that
// cannot lint at all.
const bootstrapPath = path.join(rootDirectory, "dist", "lint-bootstrap.mjs");
if (!existsSync(bootstrapPath)) {
	console.error("[check-dist] dist/lint-bootstrap.mjs is missing; isentinel-lint needs it.");
	process.exit(1);
}

console.log("[check-dist] dist/lint-bootstrap.mjs is present.");
