/**
 * Generates `src/oxlint/typegen.d.ts`: typed rule maps for oxlint config
 * items, keyed by canonical oxlint rule names.
 *
 * - Native (Rust) rules come from oxlint's `configuration_schema.json` (option
 *   types via the `DummyRuleMap` interface oxlint ships) and `oxlint --rules
 *   --format=json` (oxc.rs doc links, type-aware flags).
 * - JsPlugin rules whose oxlint prefix differs from the ESLint-side prefix
 *   (for example `unicorn-js/*`) are re-exported from the ESLint-side
 *   `RuleOptions` with doc links taken from each plugin's rule metadata.
 * - JsPlugin rules that keep their ESLint-side prefix (for example
 *   `perfectionist/*`) reuse `RuleOptions` through a filtering mapped type,
 *   which preserves the original plugin doc hovers.
 *
 * Must run after `scripts/typegen.ts`, which produces the `src/typegen.d.ts`
 * this script reads.
 */
import { pluginsToRulesDTS } from "eslint-typegen/core";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import { oxlintJsPluginPrefixRenames, oxlintJsPlugins } from "../src/rules/oxlint-mapping.ts";

interface OxlintRuleInfo {
	default: boolean;
	docs_url: string;
	scope: string;
	type_aware: boolean;
	value: string;
}

interface RuleMeta {
	deprecated?: unknown;
	docs?: { description?: string; url?: string };
}

const require = createRequire(import.meta.url);
const oxlintRoot = path.join(path.dirname(require.resolve("oxlint")), "..");

// ----- Native rules -----

const schema = JSON.parse(
	await fs.readFile(path.join(oxlintRoot, "configuration_schema.json"), "utf8"),
) as { definitions: { DummyRuleMap: { properties: Record<string, unknown> } } };

const nativeKeys = Object.keys(schema.definitions.DummyRuleMap.properties).sort();

const rulesResult = spawnSync(
	process.execPath,
	[path.join(oxlintRoot, "bin/oxlint"), "--rules", "--format=json"],
	{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
if (rulesResult.status !== 0) {
	throw new Error(`oxlint --rules failed: ${rulesResult.stderr}`);
}

const ruleInfos = JSON.parse(rulesResult.stdout) as Array<OxlintRuleInfo>;
const ruleInfoByKey = new Map<string, OxlintRuleInfo>();
for (const info of ruleInfos) {
	// `--rules` scopes use underscores (jsx_a11y), config keys use dashes.
	const prefix = info.scope.replaceAll("_", "-");
	const key = prefix === "eslint" ? info.value : `${prefix}/${info.value}`;
	ruleInfoByKey.set(key, info);
}

const missingInfo = nativeKeys.filter((key) => !ruleInfoByKey.has(key));
if (missingInfo.length > 0) {
	throw new Error(
		`configuration_schema.json rules missing from \`oxlint --rules\`: ${missingInfo.join(", ")}`,
	);
}

const nativeEntries = nativeKeys.map((key) => {
	const info = ruleInfoByKey.get(key);
	const lines = ["  /**"];
	if (info?.type_aware === true) {
		lines.push("   * Requires type information (`oxlint --type-aware`).", "   *");
	}

	lines.push(`   * @see ${info?.docs_url}`, "   */", `  '${key}'?: DummyRuleMap['${key}']`);
	return lines.join("\n");
});

// ----- JsPlugin rules -----

// Keys of the ESLint-side generated RuleOptions, used to type renamed
// jsPlugin rules by reference instead of re-compiling their schemas.
const eslintTypegen = await fs.readFile("src/typegen.d.ts", "utf8");
const eslintRuleKeys = new Set(
	[...eslintTypegen.matchAll(/^ {2}'([^']+)'\?:/gm)].flatMap((match) => {
		return match[1] === undefined ? [] : [match[1]];
	}),
);
const eslintRulePrefixes = new Set(
	Array.from(eslintRuleKeys, (key) => key.slice(0, Math.max(0, key.lastIndexOf("/")))),
);

async function loadPluginRules(specifier: string): Promise<Record<string, { meta?: RuleMeta }>> {
	const imported = (await import(specifier)) as Record<string, unknown>;
	const unwrapped = (imported["default"] ?? imported) as { default?: unknown; rules?: unknown };
	const plugin = (unwrapped.rules === undefined ? unwrapped.default : unwrapped) as {
		rules?: Record<string, { meta?: RuleMeta }>;
	};
	if (plugin.rules === undefined) {
		throw new Error(`Cannot resolve rules of jsPlugin package: ${specifier}`);
	}

	return plugin.rules;
}

function toJsdoc(meta: RuleMeta | undefined): Array<string> {
	const lines = ["  /**"];
	const description = meta?.docs?.description?.replaceAll(/\s+/g, " ").replaceAll("*/", "*\\/");
	if (description !== undefined && description !== "") {
		lines.push(`   * ${description}`);
	}

	if (meta?.docs?.url !== undefined) {
		lines.push(`   * @see ${meta.docs.url}`);
	}

	if (meta?.deprecated !== undefined && meta.deprecated !== false) {
		lines.push("   * @deprecated");
	}

	lines.push("   */");
	return lines;
}

const collator = new Intl.Collator();

const renamedEntries: Array<string> = [];
let renamedFallbacks = 0;
const renamedPrefixPairs = Object.entries(oxlintJsPluginPrefixRenames);
renamedPrefixPairs.sort(([, a], [, b]) => collator.compare(a, b));

for (const [eslintPrefix, oxlintPrefix] of renamedPrefixPairs) {
	const specifier = oxlintJsPlugins[oxlintPrefix];
	if (specifier === undefined) {
		throw new Error(`No jsPlugin specifier for renamed prefix: ${oxlintPrefix}`);
	}

	const rules = await loadPluginRules(specifier);
	for (const ruleName of Object.keys(rules).sort()) {
		const eslintKey = eslintPrefix === "" ? ruleName : `${eslintPrefix}/${ruleName}`;
		let typeReference = `RuleOptions['${eslintKey}']`;
		if (!eslintRuleKeys.has(eslintKey)) {
			typeReference = "DummyRule";
			renamedFallbacks += 1;
		}

		renamedEntries.push(
			[
				...toJsdoc(rules[ruleName]?.meta),
				`  '${oxlintPrefix}/${ruleName}'?: ${typeReference}`,
			].join("\n"),
		);
	}
}

// JsPlugin prefixes that keep their ESLint-side names. Prefixes present in the
// ESLint-side RuleOptions are picked up by a mapped type (which preserves the
// plugin doc hovers); the rest get their types generated from the plugin.
const renamedOxlintPrefixes = new Set(Object.values(oxlintJsPluginPrefixRenames));
const keptPrefixes = Object.keys(oxlintJsPlugins)
	.filter((prefix) => !renamedOxlintPrefixes.has(prefix))
	.sort();
const keptMappedPrefixes = keptPrefixes.filter((prefix) => eslintRulePrefixes.has(prefix));
const keptGeneratedPrefixes = keptPrefixes.filter((prefix) => !eslintRulePrefixes.has(prefix));

const extraPlugins: Record<string, { rules?: unknown }> = {};
for (const prefix of keptGeneratedPrefixes) {
	const specifier = oxlintJsPlugins[prefix];
	if (specifier === undefined) {
		continue;
	}

	extraPlugins[prefix] = { rules: await loadPluginRules(specifier) };
}

let extraDts = await pluginsToRulesDTS(extraPlugins as never, {
	exportTypeName: "OxlintExtraJsPluginRuleOptions",
	includeAugmentation: false,
	includeIgnoreComments: false,
	includeTypeImports: false,
});
extraDts = extraDts.trim();

// ----- Compose -----

const dts = `/* eslint-disable */
/* prettier-ignore */
// Generated by scripts/typegen-oxlint.ts — do not edit.
import type { Linter } from 'eslint'
import type { DummyRule, DummyRuleMap } from 'oxlint'

import type { RuleOptions } from '../typegen'

/**
 * Rules implemented natively by oxlint (in Rust), including the tsgolint
 * type-aware rules.
 */
export interface OxlintNativeRuleOptions {
${nativeEntries.join("\n")}
}

/**
 * JsPlugin rules whose oxlint-side prefix differs from the ESLint-side prefix
 * (native oxlint plugin prefixes are reserved, so those jsPlugins use \`-js\`
 * aliases).
 */
export interface OxlintRenamedJsPluginRuleOptions {
${renamedEntries.join("\n")}
}

${extraDts}

/** JsPlugin prefixes whose rules keep their ESLint-side names in oxlint configs. */
type OxlintKeptJsPluginPrefix = ${keptMappedPrefixes.map((prefix) => `'${prefix}'`).join(" | ")}

/** JsPlugin rules whose oxlint names match the ESLint-side names. */
type OxlintKeptJsPluginRuleOptions = {
  [K in keyof RuleOptions as K extends \`\${OxlintKeptJsPluginPrefix}/\${string}\` ? K : never]: RuleOptions[K]
}

/** All rules known to the oxlint factory, keyed by canonical oxlint rule name. */
export type OxlintRuleOptions = OxlintKeptJsPluginRuleOptions &
  OxlintExtraJsPluginRuleOptions &
  OxlintRenamedJsPluginRuleOptions &
  OxlintNativeRuleOptions

/**
 * Rule map for oxlint config items: known rules are fully typed, unknown
 * rules fall back to \`DummyRule\`.
 */
export type OxlintRules = Record<string, DummyRule | undefined> & OxlintRuleOptions
`;

await fs.writeFile("src/oxlint/typegen.d.ts", dts);

console.log(
	`typegen-oxlint: ${nativeKeys.length} native rules, ${renamedEntries.length} renamed jsPlugin rules ` +
		`(${renamedFallbacks} without RuleOptions types), ` +
		`${keptMappedPrefixes.length} kept prefixes mapped, ` +
		`${keptGeneratedPrefixes.length} kept prefixes generated (${keptGeneratedPrefixes.join(", ")})`,
);
