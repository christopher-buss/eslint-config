import { isOxlintCovered } from "../rules/oxlint-mapping.ts";
import type { TypedFlatConfigItem } from "./types.ts";

/**
 * Remove rules covered by oxlint (per the oxlint rule mapping) from the
 * resolved ESLint configs. Only enabled rules in `isentinel/*` configs are
 * removed; `"off"` entries and user configs are left untouched.
 *
 * @param configs - The resolved flat config items (mutated in place).
 */
export function dropOxlintCoveredRules(configs: Array<TypedFlatConfigItem>): void {
	for (const config of configs) {
		if (config.name === undefined || !config.name.startsWith("isentinel/")) {
			continue;
		}

		if (config.rules === undefined || targetsMarkdown(config.files)) {
			continue;
		}

		dropCoveredRulesFromConfig(config.rules);
	}
}

function dropCoveredRulesFromConfig(rules: NonNullable<TypedFlatConfigItem["rules"]>): void {
	for (const [rule, value] of Object.entries(rules)) {
		if (value === undefined || !isOxlintCovered(rule)) {
			continue;
		}

		const severity = Array.isArray(value) ? value[0] : value;
		if (severity === "off" || severity === 0) {
			continue;
		}

		delete rules[rule];
	}
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
