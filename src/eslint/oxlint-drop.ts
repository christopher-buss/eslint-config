import { GLOB_MARKDOWN_CODE } from "../globs.ts";
import { isOxlintCovered } from "../rules/oxlint-mapping.ts";
import type { TypedFlatConfigItem } from "./types.ts";

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
 */
export function dropOxlintCoveredRules(configs: Array<TypedFlatConfigItem>): void {
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

		const dropped = dropCoveredRulesFromConfig(config.rules);
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

function dropCoveredRulesFromConfig(
	rules: NonNullable<TypedFlatConfigItem["rules"]>,
): NonNullable<TypedFlatConfigItem["rules"]> {
	const dropped: NonNullable<TypedFlatConfigItem["rules"]> = {};

	for (const [rule, value] of Object.entries(rules)) {
		if (value === undefined || !isOxlintCovered(rule)) {
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
