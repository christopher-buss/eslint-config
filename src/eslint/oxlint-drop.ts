import { GLOB_MARKDOWN_CODE, GLOB_SRC_EXTENSIONS } from "../globs.ts";
import {
	isPresetRuleJsPlugin,
	isPresetRuleOxlintCovered,
	resolveOxlintRule,
	routeTarget,
} from "../oxlint/routing.ts";
import type { OxlintRoute } from "../oxlint/routing.ts";
import type { TypedFlatConfigItem } from "./types.ts";

const HYBRID_FORMATTING_RULES = new Set(["oxfmt/oxfmt"]);

/** The real file extensions oxlint can parse. */
const JS_TS_EXTENSIONS: ReadonlySet<string> = new Set(GLOB_SRC_EXTENSIONS);

/** A glob wildcard, which makes an extension fragment match anything. */
const GLOB_WILDCARD = /[*?]/;

/** One brace or bracket group, with no nesting. */
const GLOB_GROUP = /\{[^{}]*\}|\[[^[\]]*\]/gu;

/**
 * {@link GLOB_GROUP} as a capturing splitter, so the groups survive a split.
 */
const GLOB_GROUP_SPLIT = /(\{[^{}]*\}|\[[^[\]]*\])/u;

/**
 * Any glob group delimiter, left over when a group is nested or unterminated.
 */
const GLOB_GROUP_DELIMITER = /[{}[\]]/u;

/** A single character, used to list the members of a bracket group. */
const GLOB_ANY_CHARACTER = /./gu;

/**
 * How much of the mapping oxlint owns in hybrid mode.
 *
 * - `full` — every mapped rule (native, tsgolint and jsPlugin).
 * - `native` — only the rules oxlint implements natively (plus the tsgolint
 *   type-aware rules, which are also Rust). JsPlugin rules stay in ESLint,
 *   where their original plugins already run.
 */
export type OxlintHybridMode = "full" | "native";

interface DeadRuleReference {
	config: string;
	rule: string;
}

/**
 * Warn when a user-supplied config references a rule that oxlint owns in hybrid
 * mode (`oxlint: true`). The preset drops every oxlint-covered rule from the
 * ESLint side and lets oxlint format real JS/TS files, so such entries silently
 * do nothing. Configs oxlint cannot reach are exempt: Markdown-scoped ones
 * (oxlint cannot lint Markdown virtual files, so the preset re-enables those
 * rules there) and ones scoped to a non-JS/TS language, which oxlint never
 * parses.
 *
 * @param configs - The resolved flat config items.
 * @param mode - The hybrid mode; in `native` mode jsPlugin rules and formatting
 *   stay in ESLint, so entries for them are live and not reported.
 */
export function warnDeadMappedRules(
	configs: Array<TypedFlatConfigItem>,
	mode: OxlintHybridMode,
): void {
	const references = findDeadMappedRules(configs, mode);
	if (references.length === 0) {
		return;
	}

	const lines = references.map(({ config, rule }) => `  - "${rule}" in ${config}`);
	// oxlint-disable-next-line no-console -- Info for plugin
	console.warn(
		"[@isentinel/eslint-config] These config entries reference rules that " +
			"oxlint owns in hybrid mode, so they have no effect in ESLint. Move " +
			`them to oxlint.config.ts (or your oxfmt options) or remove them:\n${lines.join("\n")}`,
	);
}

/**
 * Warn that hybrid mode is enabled without oxlint-tsgolint, so the type-aware
 * rules stay in ESLint instead of running in oxlint.
 */
export function warnMissingTsgolint(): void {
	// oxlint-disable-next-line no-console -- Info for plugin
	console.warn(
		"[@isentinel/eslint-config] Hybrid mode is enabled but oxlint-tsgolint " +
			"is not installed. Type-aware rules stay in ESLint instead of running " +
			"in oxlint; install oxlint-tsgolint for the full hand-off.",
	);
}

/**
 * Remove rules the Oxlint resolver owns from the resolved ESLint configs. Only
 * enabled rules in `isentinel/*` configs are removed; `"off"` entries and user
 * configs are left untouched.
 *
 * Oxlint cannot lint Markdown virtual files (fenced code blocks processed by
 * the markdown plugin), so every dropped rule is re-added in a sibling config
 * scoped to the Markdown-virtual subset of the original config's files. The
 * sibling is inserted directly after the original so later configs (for
 * example the markdown disables) still take precedence.
 *
 * Configs scoped to a language oxlint does not parse are skipped outright: it
 * reads only the JS/TS family, so handing it `oxfmt/oxfmt` for YAML, JSON, CSS
 * or GraphQL would drop the formatter from ESLint without any engine picking it
 * up. See {@link targetsJsOrTs}.
 *
 * @param configs - The resolved flat config items (mutated in place).
 * @param typeAware - Whether oxlint runs type-aware (oxlint-tsgolint present).
 *   When `false`, tsgolint rules are kept in ESLint so they do not vanish from
 *   both engines.
 * @param mode - The hybrid mode; `native` keeps jsPlugin rules in ESLint.
 */
export function dropOxlintCoveredRules(
	configs: Array<TypedFlatConfigItem>,
	typeAware = true,
	mode: OxlintHybridMode = "full",
): void {
	for (let index = 0; index < configs.length; index += 1) {
		const config = configs[index];
		if (
			config?.name === undefined ||
			!config.name.startsWith("isentinel/") ||
			config.name.endsWith("/markdown-code") ||
			config.rules === undefined ||
			targetsMarkdown(config.files) ||
			!targetsJsOrTs(config.files)
		) {
			continue;
		}

		const dropped = dropCoveredRulesFromConfig(config.rules, typeAware, mode);
		if (Object.keys(dropped).length === 0) {
			continue;
		}

		// Configs that explicitly ignore Markdown VIRTUAL files (the
		// type-aware configs use ignores like "**/*.md/**") must not get a
		// Markdown sibling: their rules cannot run without type information,
		// which Markdown code blocks never have. Note the trailing slash —
		// the factory's default ignores ("**/*.md") only exclude Markdown
		// files themselves, not the virtual code blocks inside them.
		const ignoresMarkdownVirtual = (config.ignores ?? []).some(
			(pattern) => typeof pattern === "string" && pattern.includes(".md/"),
		);
		if (ignoresMarkdownVirtual) {
			continue;
		}

		configs.splice(index + 1, 0, {
			name: `${config.name}/markdown-code`,
			files: markdownVirtualFiles(config.files),
			rules: dropped,
		});
		index += 1;
	}
}

/**
 * Whether a rule named in a *user* config is one the preset hands to oxlint.
 *
 * Deliberately reads the generated compatibility view rather than the resolver.
 * The resolver is total, so it would answer "yes" for any rule oxlint could
 * conceivably run and warn about entries that are not dead at all — user
 * configs are never dropped, so a rule the preset never enables keeps working
 * in ESLint exactly as written. The view lists only the preset's own rules,
 * which is the set whose ESLint half hybrid mode actually removes.
 *
 * @param rule - The canonical ESLint rule name.
 * @param mode - The hybrid mode.
 * @returns Whether the preset hands the rule to oxlint.
 */
function presetHandsRuleToOxlint(rule: string, mode: OxlintHybridMode): boolean {
	if (!isPresetRuleOxlintCovered(rule)) {
		return false;
	}

	return mode === "full" || !isPresetRuleJsPlugin(rule);
}

function isPresetConfig(config: TypedFlatConfigItem): boolean {
	return config.name?.startsWith("isentinel/") ?? false;
}

function describeConfig(config: TypedFlatConfigItem): string {
	return config.name !== undefined ? `config "${config.name}"` : "an unnamed config";
}

/**
 * Whether every file pattern of a config targets Markdown content (either
 * `.md` files or virtual code blocks inside them). Oxlint cannot lint those,
 * so their rules always stay in ESLint.
 *
 * @param files - The config's `files` patterns.
 * @returns Whether the config only targets Markdown content.
 */
function targetsMarkdown(files: TypedFlatConfigItem["files"]): boolean {
	if (files === undefined) {
		return false;
	}

	const patterns = files.flat();
	return (
		patterns.length > 0 &&
		patterns.every((pattern) => typeof pattern === "string" && pattern.includes(".md"))
	);
}

/**
 * The strings one part of a {@link GLOB_GROUP_SPLIT} split can stand for: the
 * comma-separated members of a brace group, the individual characters of a
 * bracket group, or the literal text itself. A part that still holds a group
 * delimiter is a nested or unterminated group, which is not expanded.
 *
 * @param part - One part of a glob fragment split on its groups.
 * @returns The alternatives, or `undefined` when the part is not expandable.
 */
function groupAlternatives(part: string): Array<string> | undefined {
	const body = part.slice(1, -1);
	if (part.startsWith("{")) {
		return body.split(",");
	}

	if (part.startsWith("[")) {
		return body.match(GLOB_ANY_CHARACTER) ?? [];
	}

	return GLOB_GROUP_DELIMITER.test(part) ? undefined : [part];
}

/**
 * Expand the brace and character-class alternatives of a glob fragment.
 *
 * Only the closed forms the preset's globs use are handled (`{,c,m}`, `[jt]`);
 * anything with a wildcard, a nested group or an unterminated group yields
 * `undefined`, meaning "could be anything". Callers treat that as a match, so
 * an unknown pattern keeps the pre-existing drop behavior.
 *
 * @param fragment - The glob fragment to expand.
 * @returns Every literal string the fragment can produce, or `undefined` when
 *   the fragment is not a closed set of literals.
 */
function expandGlobAlternatives(fragment: string): Array<string> | undefined {
	if (GLOB_WILDCARD.test(fragment)) {
		return undefined;
	}

	let results = [""];
	for (const part of fragment.split(GLOB_GROUP_SPLIT)) {
		const alternatives = groupAlternatives(part);
		if (alternatives === undefined) {
			return undefined;
		}

		results = results.flatMap((prefix) => {
			return alternatives.map((alternative) => prefix + alternative);
		});
	}

	return results;
}

/**
 * The index of the extension dot in a glob's last path segment, or `-1` when it
 * has none. Dots inside a brace or bracket group are masked out first: they
 * belong to an alternative, not to the extension boundary.
 *
 * @param segment - The last path segment of a `files` pattern.
 * @returns The index of the extension dot, or `-1`.
 */
function extensionDotIndex(segment: string): number {
	const masked = segment.replaceAll(GLOB_GROUP, (group) => "\0".repeat(group.length));
	return masked.lastIndexOf(".");
}

/**
 * Whether a single `files` pattern can match a file oxlint reads.
 *
 * Oxlint parses only the JS/TS family, so a pattern whose extension is a closed
 * set of non-JS/TS extensions (`**\/*.y{,a}ml`, `**\/*.json{,5,c}`) describes
 * files oxlint never sees. A pattern whose last segment has no extension, or
 * whose extension is not a closed set, matches conservatively.
 *
 * @param pattern - The `files` pattern to classify.
 * @returns Whether oxlint can lint something the pattern matches.
 */
function patternTargetsJsOrTs(pattern: string): boolean {
	const segment = pattern.slice(pattern.lastIndexOf("/") + 1);
	const dot = extensionDotIndex(segment);
	if (dot === -1) {
		return true;
	}

	const extensions = expandGlobAlternatives(segment.slice(dot + 1));
	if (extensions === undefined) {
		return true;
	}

	return extensions.some((extension) => JS_TS_EXTENSIONS.has(extension));
}

/**
 * Whether a config's `files` reach any file oxlint can lint.
 *
 * Hybrid mode only hands a rule to oxlint for the files oxlint actually parses.
 * A config scoped to YAML, JSON, CSS or GraphQL is invisible to oxlint, so its
 * rules must stay in ESLint or they run in neither engine — the case that
 * silently dropped `oxfmt/oxfmt` from every non-JS formatting config.
 *
 * @param files - The config's `files` patterns; nested arrays are AND-combined,
 *   so they only reach JS/TS when every member does.
 * @returns Whether oxlint can lint something the config targets.
 */
function targetsJsOrTs(files: TypedFlatConfigItem["files"]): boolean {
	if (files === undefined || files.length === 0) {
		return true;
	}

	return files.some((entry) => {
		if (typeof entry === "string") {
			return patternTargetsJsOrTs(entry);
		}

		return entry.every((pattern) => patternTargetsJsOrTs(pattern));
	});
}

function findDeadMappedRules(
	configs: Array<TypedFlatConfigItem>,
	mode: OxlintHybridMode,
): Array<DeadRuleReference> {
	const references: Array<DeadRuleReference> = [];

	for (const config of configs) {
		if (
			config.rules === undefined ||
			isPresetConfig(config) ||
			targetsMarkdown(config.files) ||
			!targetsJsOrTs(config.files)
		) {
			continue;
		}

		const label = describeConfig(config);
		for (const [rule, value] of Object.entries(config.rules)) {
			if (
				value !== undefined &&
				(presetHandsRuleToOxlint(rule, mode) ||
					(mode === "full" && HYBRID_FORMATTING_RULES.has(rule)))
			) {
				references.push({ config: label, rule });
			}
		}
	}

	return references;
}

/**
 * Whether oxlint runs the rule in the given hybrid mode, and therefore whether
 * ESLint must drop it.
 *
 * Asks the resolver rather than the generated compatibility view: the view is
 * built from a sample of factory options, so a rule the preset only enables
 * under an unsampled option would be absent from it, and ESLint would keep a
 * rule the oxlint factory also emits. The emit side (`splitOxlintRules`) reads
 * the resolver, so this side must too or the two disagree.
 *
 * @param route - The rule's resolved route.
 * @param typeAware - Whether oxlint-tsgolint is present to run type-aware
 *   rules. When absent they stay in ESLint rather than vanishing from both.
 * @param mode - The hybrid mode.
 * @returns Whether oxlint runs the rule.
 */
function oxlintRunsRule(route: OxlintRoute, typeAware: boolean, mode: OxlintHybridMode): boolean {
	const target = routeTarget(route);
	if (target === undefined) {
		return false;
	}

	if (target === "js-plugin") {
		return mode === "full";
	}

	return target === "native" || typeAware;
}

function dropCoveredRulesFromConfig(
	rules: NonNullable<TypedFlatConfigItem["rules"]>,
	typeAware: boolean,
	mode: OxlintHybridMode,
): NonNullable<TypedFlatConfigItem["rules"]> {
	const dropped: NonNullable<TypedFlatConfigItem["rules"]> = {};

	for (const [rule, value] of Object.entries(rules)) {
		if (value === undefined || !oxlintRunsRule(resolveOxlintRule(rule), typeAware, mode)) {
			continue;
		}

		const severity = Array.isArray(value) ? value[0] : value;
		if (severity === "off" || severity === 0) {
			continue;
		}

		dropped[rule] = value;
		delete rules[rule];
	}

	return dropped;
}

/**
 * Narrow a config's `files` patterns to the Markdown JS/TS code-block subset
 * by AND-combining each pattern with the Markdown code-block glob.
 *
 * The glob must be extension-restricted (not a bare Markdown container glob):
 * the markdown processor also emits virtual files for non-JS fences (json,
 * sh, and notably markdown, which yields a virtual `*.md/*.md` file that the
 * plugin-registering configs default-ignore — matching it would make ESLint
 * fail with "could not find plugin").
 *
 * @param files - The original config's `files` patterns.
 * @returns Patterns matching only Markdown code blocks covered by the config.
 */
function markdownVirtualFiles(
	files: TypedFlatConfigItem["files"],
): NonNullable<TypedFlatConfigItem["files"]> {
	if (files === undefined) {
		return [GLOB_MARKDOWN_CODE];
	}

	return files.map((pattern) => {
		return [GLOB_MARKDOWN_CODE, ...[pattern].flat()];
	});
}
