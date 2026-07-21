import { GLOB_MARKDOWN_CODE } from "../globs.ts";
import { isJsPluginRule, isOxlintCovered, isTsgolintRule } from "../rules/oxlint-mapping.ts";
import type { TypedFlatConfigItem } from "./types.ts";

const HYBRID_FORMATTING_RULES = new Set(["oxfmt/oxfmt"]);

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
 * do nothing. Markdown-scoped configs are exempt: oxlint cannot lint Markdown
 * virtual files, so the preset re-enables those rules there.
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
 * Remove rules covered by oxlint (per the oxlint rule mapping) from the
 * resolved ESLint configs. Only enabled rules in `isentinel/*` configs are
 * removed; `"off"` entries and user configs are left untouched.
 *
 * Oxlint cannot lint Markdown virtual files (fenced code blocks processed by
 * the markdown plugin), so every dropped rule is re-added in a sibling config
 * scoped to the Markdown-virtual subset of the original config's files. The
 * sibling is inserted directly after the original so later configs (for
 * example the markdown disables) still take precedence.
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
			targetsMarkdown(config.files)
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
 * Whether oxlint owns the rule in the given hybrid mode (and therefore whether
 * ESLint must drop it).
 *
 * @param rule - The canonical ESLint rule name.
 * @param mode - The hybrid mode.
 * @returns Whether oxlint runs the rule.
 */
function isOwnedByOxlint(rule: string, mode: OxlintHybridMode): boolean {
	if (!isOxlintCovered(rule)) {
		return false;
	}

	return mode === "full" || !isJsPluginRule(rule);
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

function findDeadMappedRules(
	configs: Array<TypedFlatConfigItem>,
	mode: OxlintHybridMode,
): Array<DeadRuleReference> {
	const references: Array<DeadRuleReference> = [];

	for (const config of configs) {
		if (config.rules === undefined || isPresetConfig(config) || targetsMarkdown(config.files)) {
			continue;
		}

		const label = describeConfig(config);
		for (const [rule, value] of Object.entries(config.rules)) {
			if (
				value !== undefined &&
				(isOwnedByOxlint(rule, mode) ||
					(mode === "full" && HYBRID_FORMATTING_RULES.has(rule)))
			) {
				references.push({ config: label, rule });
			}
		}
	}

	return references;
}

function dropCoveredRulesFromConfig(
	rules: NonNullable<TypedFlatConfigItem["rules"]>,
	typeAware: boolean,
	mode: OxlintHybridMode,
): NonNullable<TypedFlatConfigItem["rules"]> {
	const dropped: NonNullable<TypedFlatConfigItem["rules"]> = {};

	for (const [rule, value] of Object.entries(rules)) {
		if (
			value === undefined ||
			!isOwnedByOxlint(rule, mode) ||
			(!typeAware && isTsgolintRule(rule))
		) {
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
