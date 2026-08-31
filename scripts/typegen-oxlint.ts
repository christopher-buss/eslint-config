/**
 * Generates three artifacts:
 *
 * - `src/oxlint/typegen.d.ts` — typed rule maps for oxlint config items, keyed
 *   by canonical oxlint rule names. Carries the human-facing metadata (doc
 *   links, descriptions, deprecations) as JSDoc, where an editor can show it.
 * - `src/generated/oxlint-native.ts` — the native rule names as runtime sets,
 *   plus the type-aware subset.
 * - `src/generated/oxlint-capabilities.ts` — the same for jsPlugin rules, plus
 *   the preset's own rule names, which back the exported compatibility view.
 *
 * The two runtime artifacts hold names only. Everything else a rule carries is
 * either derivable (see `jsPluginAdapterFor`) or belongs in the `.d.ts`, and
 * this module ships to every consumer.
 *
 * The effective-config sampling boots the real ESLint factory, so it must stay
 * deterministic: pass explicit values for anything the factory would otherwise
 * read from the host (`nodeMajor`), or the committed output changes with the
 * machine that generated it.
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
import { ESLint } from "eslint";
import { pluginsToRulesDTS } from "eslint-typegen/core";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import { requiresTypeChecking } from "../src/eslint/type-aware-split.ts";
import type { JsonValue } from "../src/guards.ts";
import { isRecord } from "../src/guards.ts";
import { isentinel as eslintIsentinel } from "../src/index.ts";
import {
	isPruningViewConfig,
	oxlintFamilyPolicies,
	oxlintJsPluginPrefixRenames,
	oxlintJsPluginSpecifiers,
	splitRuleName,
} from "../src/oxlint/adapters.ts";
import { combine } from "../src/utils.ts";
import { GENERATOR_NODE_MAJOR, PRESET_CONFIGS } from "./config-factories.ts";

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

/**
 * Whether a parsed `oxlint --rules` entry carries the fields this script reads.
 *
 * @param value - A parsed array element.
 * @returns Whether the value is a usable rule info entry.
 */
function isOxlintRuleInfo(value: unknown): value is OxlintRuleInfo {
	return (
		isRecord(value) &&
		typeof value["scope"] === "string" &&
		typeof value["value"] === "string" &&
		typeof value["type_aware"] === "boolean" &&
		typeof value["docs_url"] === "string"
	);
}

/**
 * Extract a rule's `meta` from an untyped plugin rule object, keeping only the
 * documentation fields the emitter reads.
 *
 * @param rule - A plugin rule value of unknown shape.
 * @returns The rule metadata, or `undefined` when absent.
 */
function ruleMetaOf(rule: unknown): RuleMeta | undefined {
	if (!isRecord(rule)) {
		return undefined;
	}

	const { meta } = rule;
	if (!isRecord(meta)) {
		return undefined;
	}

	const { deprecated, docs } = meta;
	if (!isRecord(docs)) {
		return { deprecated };
	}

	return {
		deprecated,
		docs: {
			description: typeof docs["description"] === "string" ? docs["description"] : undefined,
			url: typeof docs["url"] === "string" ? docs["url"] : undefined,
		},
	};
}

const require = createRequire(import.meta.url);
const oxlintRoot = path.join(path.dirname(require.resolve("oxlint")), "..");

// ----- Native rules -----

const schema: unknown = JSON.parse(
	await fs.readFile(path.join(oxlintRoot, "configuration_schema.json"), "utf8"),
);
const dummyRuleMapProperties =
	isRecord(schema) &&
	isRecord(schema["definitions"]) &&
	isRecord(schema["definitions"]["DummyRuleMap"]) &&
	isRecord(schema["definitions"]["DummyRuleMap"]["properties"])
		? schema["definitions"]["DummyRuleMap"]["properties"]
		: undefined;
if (dummyRuleMapProperties === undefined) {
	throw new Error(
		"configuration_schema.json: missing definitions.DummyRuleMap.properties object.",
	);
}

const nativeKeys = Object.keys(dummyRuleMapProperties).sort();

const rulesResult = spawnSync(
	process.execPath,
	[path.join(oxlintRoot, "bin/oxlint"), "--rules", "--format=json"],
	{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
if (rulesResult.status !== 0) {
	throw new Error(`oxlint --rules failed: ${rulesResult.stderr}`);
}

const parsedRuleInfos: unknown = JSON.parse(rulesResult.stdout);
if (!Array.isArray(parsedRuleInfos)) {
	throw new Error("`oxlint --rules --format=json` did not return a JSON array.");
}

const ruleInfos = parsedRuleInfos.filter(isOxlintRuleInfo);
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

// Only the two facts the resolver actually reads: does oxlint implement this
// rule natively, and does it need `--type-aware`. Category, fix status and the
// doc URL stay in `src/oxlint/typegen.d.ts`, where they reach the editor as
// JSDoc instead of shipping as runtime data nothing looks at.
const typeAwareNativeKeys = nativeKeys.filter((key) => {
	const info = ruleInfoByKey.get(key);
	if (info === undefined) {
		throw new Error(`Missing native capability metadata for ${key}`);
	}

	return info.type_aware;
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

/**
 * A plugin's `rules` record, keyed by its local rule name. Read as data:
 * `ruleMetaOf` re-validates every field it takes off an entry.
 */
type PluginRules = Record<string, JsonValue>;

async function loadPluginRules(specifier: string): Promise<PluginRules> {
	const imported: unknown = await import(specifier);
	if (!isRecord(imported)) {
		throw new Error(`Cannot resolve module for jsPlugin package: ${specifier}`);
	}

	const defaultExport = imported["default"];
	const unwrapped = isRecord(defaultExport) ? defaultExport : imported;
	const nested = unwrapped["rules"] === undefined ? unwrapped["default"] : unwrapped;
	const plugin = isRecord(nested) ? nested : undefined;
	if (plugin === undefined || !isRecord(plugin["rules"])) {
		throw new Error(`Cannot resolve rules of jsPlugin package: ${specifier}`);
	}

	return plugin["rules"];
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
// As with the native side, only existence and type-awareness are recorded. The
// oxlint name, plugin alias and package specifier are all derivable from
// `jsPluginAdapterFor`, and `test/oxlint-routing.spec.ts` asserts the two agree
// for every rule here.
const jsPluginRuleNames = new Set<string>();
const typeAwareJsPluginRuleNames = new Set<string>();

function recordJsPluginRule(eslintKey: string, rule: unknown): void {
	jsPluginRuleNames.add(eslintKey);
	// Shared with the type-aware split rather than re-narrowing the metadata
	// here, so the snapshot and the runtime fallback cannot disagree about what
	// "requires type information" means.
	if (requiresTypeChecking(rule)) {
		typeAwareJsPluginRuleNames.add(eslintKey);
	}
}

const renamedPrefixPairs = [...oxlintJsPluginPrefixRenames];
renamedPrefixPairs.sort(([, a], [, b]) => collator.compare(a, b));

for (const [eslintPrefix, oxlintPrefix] of renamedPrefixPairs) {
	const specifier = oxlintJsPluginSpecifiers.get(oxlintPrefix);
	if (specifier === undefined) {
		throw new Error(`No jsPlugin specifier for renamed prefix: ${oxlintPrefix}`);
	}

	const rules = await loadPluginRules(specifier);
	for (const ruleName of Object.keys(rules).sort()) {
		const eslintKey = eslintPrefix === "" ? ruleName : `${eslintPrefix}/${ruleName}`;
		const meta = ruleMetaOf(rules[ruleName]);
		let typeReference = `RuleOptions['${eslintKey}']`;
		if (!eslintRuleKeys.has(eslintKey)) {
			typeReference = "DummyRule";
			renamedFallbacks += 1;
		}

		renamedEntries.push(
			[...toJsdoc(meta), `  '${oxlintPrefix}/${ruleName}'?: ${typeReference}`].join("\n"),
		);
		recordJsPluginRule(eslintKey, rules[ruleName]);
	}
}

// JsPlugin prefixes that keep their ESLint-side names. Prefixes present in the
// ESLint-side RuleOptions are picked up by a mapped type (which preserves the
// plugin doc hovers); the rest get their types generated from the plugin.
const renamedOxlintPrefixes = new Set(oxlintJsPluginPrefixRenames.values());
const keptPrefixes = [...oxlintJsPluginSpecifiers.keys()]
	.filter((prefix) => !renamedOxlintPrefixes.has(prefix))
	.sort();
const keptMappedPrefixes = keptPrefixes.filter((prefix) => eslintRulePrefixes.has(prefix));
const keptGeneratedPrefixes = keptPrefixes.filter((prefix) => !eslintRulePrefixes.has(prefix));

// One pass over the kept prefixes: every prefix contributes its rule names to
// the capability sets, and the ones without ESLint-side types additionally feed
// `pluginsToRulesDTS`. Splitting this in two loaded and walked each generated
// plugin twice.
const extraPlugins: Record<string, { rules?: unknown }> = {};
for (const prefix of keptPrefixes) {
	const specifier = oxlintJsPluginSpecifiers.get(prefix);
	if (specifier === undefined) {
		// `keptPrefixes` is derived from `oxlintJsPlugins`, so this is
		// unreachable; failing loudly beats silently dropping a whole plugin.
		throw new Error(`No jsPlugin specifier for kept prefix: ${prefix}`);
	}

	const rules = await loadPluginRules(specifier);
	if (!eslintRulePrefixes.has(prefix)) {
		extraPlugins[prefix] = { rules };
	}

	for (const ruleName of Object.keys(rules).sort()) {
		recordJsPluginRule(`${prefix}/${ruleName}`, rules[ruleName]);
	}
}

// `pluginsToRulesDTS` types plugins as `ESLint.Plugin`, but these are minimal
// `{ rules }` shapes loaded from untyped oxlint jsPlugins; only `rules` is read.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- lib expects ESLint.Plugin; only `rules` is consumed
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
import type { JsonValue } from "../src/guards.ts";

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

const nativeCapabilitiesSource = `// Generated by scripts/typegen-oxlint.ts — do not edit.

/** Every rule oxlint implements natively, by its oxlint configuration name. */
export const oxlintNativeRuleNames: ReadonlySet<string> = new Set(${JSON.stringify(nativeKeys, null, "\t")});

/** The subset of {@link oxlintNativeRuleNames} that oxlint-tsgolint runs. */
export const typeAwareNativeOxlintRuleNames: ReadonlySet<string> = new Set(${JSON.stringify(typeAwareNativeKeys, null, "\t")});
`;

await fs.writeFile("src/generated/oxlint-native.ts", nativeCapabilitiesSource);

const presetConfigs = await combine(...PRESET_CONFIGS);

/**
 * Record whether the preset ever enables a rule, as opposed to only naming it
 * to switch it off. A rule reaches the map only by being named, so "named but
 * never enabled" is just a `false` entry — no separate `off` flag needed.
 *
 * @param states - The accumulating map, mutated.
 * @param rule - The canonical ESLint rule name.
 * @param value - The configured severity or `[severity, ...options]`.
 */
function recordRawRuleState(states: Map<string, boolean>, rule: string, value: unknown): void {
	if (value === undefined) {
		return;
	}

	const severity = Array.isArray(value) ? (value[0] as unknown) : value;
	const enabled = severity !== "off" && severity !== 0;
	states.set(rule, (states.get(rule) ?? false) || enabled);
}

const rawRuleStates = new Map<string, boolean>();
for (const config of presetConfigs) {
	// Pruning views are not capability declarations. Including them would turn
	// hundreds of standalone "off" entries into owned rules.
	if (isPruningViewConfig(config.name)) {
		continue;
	}

	const ruleEntries = Object.entries(config.rules ?? {});
	for (const [rule, value] of ruleEntries) {
		recordRawRuleState(rawRuleStates, rule, value);
	}
}

const commonFactoryOptions = {
	// Shared with `PRESET_CONFIGS` so the two views cannot disagree.

	e18e: { nodeMajor: GENERATOR_NODE_MAJOR },
	eslintPlugin: true,
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	jsdoc: { full: true },
	pnpm: false,
	react: true,
	typescript: { erasableOnly: true },
} as const;
const commonEffectivePaths = [
	"src/index.ts",
	"src/component.tsx",
	"src/index.js",
	"src/component.jsx",
	"src/index.spec.ts",
];
const effectiveVariants = [
	{
		options: {
			...commonFactoryOptions,
			name: "typegen/effective-game",
			test: { jest: true },
		},
		paths: [...commonEffectivePaths, "index.ts"],
	},
	{
		options: {
			...commonFactoryOptions,
			name: "typegen/effective-package-jest",
			roblox: false,
			// `extended` is off by default, so its rules would otherwise never
			// appear in an effective config and would fall out of the view.
			test: { jest: { extended: true } },
			type: "package" as const,
		},
		paths: [...commonEffectivePaths, "scripts/build.ts"],
	},
	{
		options: {
			...commonFactoryOptions,
			name: "typegen/effective-package-vitest",
			roblox: false,
			test: { vitest: { typecheck: true } },
			type: "package" as const,
		},
		// Only the paths this variant resolves differently from the jest one:
		// the two agree exactly on the non-test paths, and re-deriving those
		// costs ~360 ms of every `pnpm gen` for no additional coverage.
		paths: ["src/index.spec.ts", "bin/run.ts"],
	},
];

const effectiveEnabledRuleNames = new Set<string>();
for (const variant of effectiveVariants) {
	const configs = [...(await eslintIsentinel(variant.options))];
	const eslint = new ESLint({
		cwd: process.cwd(),
		overrideConfig: configs,
		overrideConfigFile: true,
	});

	for (const filePath of variant.paths) {
		const effective: unknown = await eslint.calculateConfigForFile(filePath);
		const effectiveRules = isRecord(effective) ? effective["rules"] : undefined;
		const effectiveRuleEntries = Object.entries(isRecord(effectiveRules) ? effectiveRules : {});
		for (const [rule, value] of effectiveRuleEntries) {
			const severity = Array.isArray(value) ? (value[0] as unknown) : value;
			if (severity !== "off" && severity !== 0) {
				effectiveEnabledRuleNames.add(rule);
			}
		}
	}
}

// Legacy compatibility disables name rules no current ESLint implementation
// owns. They remain useful as raw preset relaxations, but are not capabilities
// and must not enter the generated ownership view.
const LEGACY_PRESET_DISABLES = new Set(["no-new-symbol", "ts/no-dupe-class-members"]);
const presetRuleNames = new Set(effectiveEnabledRuleNames);
// Formatting has its own hybrid hand-off and is intentionally outside the
// rule resolver's public compatibility view.
presetRuleNames.delete("oxfmt/oxfmt");
for (const [rule, enabled] of rawRuleStates) {
	if (!enabled && !LEGACY_PRESET_DISABLES.has(rule)) {
		presetRuleNames.add(rule);
	}
}

const unknownFamilies = new Set<string>();
for (const rule of presetRuleNames) {
	const { prefix } = splitRuleName(rule);
	if (!oxlintFamilyPolicies.has(prefix)) {
		unknownFamilies.add(prefix);
	}
}

if (unknownFamilies.size > 0) {
	throw new Error(
		`Effective preset rule families need an Oxlint routing policy: ${[...unknownFamilies].sort().join(", ")}`,
	);
}

const presetEnabledRuleNames = new Set(
	[...rawRuleStates].flatMap(([rule, enabled]) => (enabled ? [rule] : [])),
);
for (const rule of effectiveEnabledRuleNames) {
	presetEnabledRuleNames.add(rule);
}

/**
 * Sort rule names for a stable generated artifact.
 *
 * @param names - The rule names to sort.
 * @returns The names in collation order.
 */
function sortByName(names: Set<string>): Array<string> {
	return [...names].sort((left, right) => collator.compare(left, right));
}

const capabilitiesSource = `// Generated by scripts/typegen-oxlint.ts — do not edit.

/** Every rule the installed jsPlugins expose, by canonical ESLint name. */
export const jsPluginRuleNames: ReadonlySet<string> = new Set(${JSON.stringify(sortByName(jsPluginRuleNames), null, "\t")});

/**
 * The subset of {@link jsPluginRuleNames} declaring
 * \`meta.docs.requiresTypeChecking\`. Oxlint jsPlugins have no type information,
 * so these cannot run there.
 */
export const typeAwareJsPluginRuleNames: ReadonlySet<string> = new Set(${JSON.stringify(sortByName(typeAwareJsPluginRuleNames), null, "\t")});

/** Every rule the preset can name, used for the exported compatibility view. */
export const effectivePresetRuleNames: ReadonlySet<string> = new Set(${JSON.stringify(sortByName(presetRuleNames), null, "\t")});

/** The subset the preset enables somewhere, rather than only disabling. */
export const enabledPresetRuleNames: ReadonlySet<string> = new Set(${JSON.stringify(sortByName(presetEnabledRuleNames), null, "\t")});
`;
await fs.writeFile("src/generated/oxlint-capabilities.ts", capabilitiesSource);

console.log(
	`typegen-oxlint: ${nativeKeys.length} native rules, ${renamedEntries.length} renamed jsPlugin rules ` +
		`(${renamedFallbacks} without RuleOptions types), ` +
		`${keptMappedPrefixes.length} kept prefixes mapped, ` +
		`${keptGeneratedPrefixes.length} kept prefixes generated (${keptGeneratedPrefixes.join(", ")})`,
);
