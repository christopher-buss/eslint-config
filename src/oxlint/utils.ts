import type { ExternalPluginEntry } from "oxlint";

import {
	excludedFromOxlint,
	isOxlintCovered,
	oxlintJsPlugins,
	oxlintRuleMapping,
	translateRuleToOxlint,
} from "../rules/oxlint-mapping.ts";
import type { Rules } from "../types.ts";
import type { OxlintPlugin, TypedOxlintConfigItem } from "./types.ts";

const CHARACTER_CLASS_PATTERN = /^\[([^\]]+)\]$/;

const NATIVE_PLUGINS = new Set<OxlintPlugin>([
	"eslint",
	"import",
	"jest",
	"jsdoc",
	"jsx-a11y",
	"nextjs",
	"node",
	"oxc",
	"promise",
	"react",
	"react-perf",
	"typescript",
	"unicorn",
	"vitest",
	"vue",
]);

export interface SplitOxlintRules {
	jsPluginRules: Rules;
	jsPlugins: Array<ExternalPluginEntry>;
	nativePlugins: Array<OxlintPlugin>;
	nativeRules: Rules;
}

export interface OxlintConfigFragmentOptions {
	name: string;
	excludeFiles?: Array<string>;
	files: Array<string>;
	globals?: TypedOxlintConfigItem["globals"];
	rules: Rules | undefined;
	settings?: TypedOxlintConfigItem["settings"];
}

/**
 * Convert an ESLint extglob pattern to oxlint-compatible glob syntax.
 *
 * Oxlint supports braces and character classes but not extglob groups, so
 * `?(...)` groups are rewritten as brace alternations with an empty branch
 * (`**\/*.?([cm])ts` becomes `**\/*.{,c,m}ts`).
 *
 * @param pattern - The ESLint glob pattern.
 * @returns The oxlint-compatible glob pattern.
 */
export function toOxlintGlob(pattern: string): string {
	return pattern.replaceAll(/\?\(([^)]+)\)/g, (_match, inner: string) => {
		const alternatives = inner
			.split("|")
			.flatMap((part) => {
				const characterClass = CHARACTER_CLASS_PATTERN.exec(part);
				return characterClass?.[1] !== undefined ? [...characterClass[1]] : [part];
			})
			.join(",");
		return `{,${alternatives}}`;
	});
}

/**
 * Split a canonical (ESLint-named) rule map into oxlint-native rules and
 * jsPlugin rules, translating rule names via the oxlint rule mapping.
 *
 * Rules that are not part of the hybrid mapping (for example jest or react
 * rules, which only run in standalone mode) are treated as jsPlugin rules.
 * Disabled unmapped rules are skipped so that no jsPlugin is loaded solely for
 * an "off" entry.
 *
 * @param rules - The canonical rule map.
 * @returns The split rules with the plugins each side requires.
 */
export function splitOxlintRules(rules: Rules | undefined): SplitOxlintRules {
	const nativeRules: Rules = {};
	const jsPluginRules: Rules = {};
	const nativePlugins = new Set<OxlintPlugin>();
	const jsPluginPrefixes = new Set<string>();

	const entries = Object.entries(rules ?? {});
	for (const [rule, value] of entries) {
		if (value === undefined || excludedFromOxlint.has(rule)) {
			continue;
		}

		const covered = isOxlintCovered(rule);
		const severity = Array.isArray(value) ? value[0] : value;
		const isOff = severity === "off" || severity === 0;
		if (!covered && isOff) {
			continue;
		}

		const translated = translateRuleToOxlint(rule);
		const target = covered ? mappedTarget(rule) : "js-plugin";

		if (target === "js-plugin") {
			const prefix = translated.slice(0, translated.indexOf("/"));
			jsPluginRules[translated] = value;
			jsPluginPrefixes.add(prefix);
			continue;
		}

		nativeRules[translated] = value;
		const slashIndex = translated.indexOf("/");
		const nativePrefix = slashIndex === -1 ? "eslint" : translated.slice(0, slashIndex);
		if (NATIVE_PLUGINS.has(nativePrefix as OxlintPlugin)) {
			nativePlugins.add(nativePrefix as OxlintPlugin);
		}
	}

	const jsPlugins: Array<ExternalPluginEntry> = [];
	for (const prefix of jsPluginPrefixes) {
		const specifier = oxlintJsPlugins[prefix];
		if (specifier === undefined) {
			throw new Error(`[@isentinel/eslint-config] Unknown oxlint jsPlugin prefix: ${prefix}`);
		}

		jsPlugins.push({ name: prefix, specifier });
	}

	return {
		jsPluginRules,
		jsPlugins,
		nativePlugins: [...nativePlugins],
		nativeRules,
	};
}

/**
 * Create oxlint config fragments from a canonical rule map, one fragment for
 * native rules and one for jsPlugin rules.
 *
 * @param options - The fragment options.
 * @returns The generated config fragments.
 */
export function createOxlintConfigs({
	name,
	excludeFiles,
	files,
	globals,
	rules,
	settings,
}: OxlintConfigFragmentOptions): Array<TypedOxlintConfigItem> {
	const { jsPluginRules, jsPlugins, nativePlugins, nativeRules } = splitOxlintRules(rules);

	const fragments: Array<TypedOxlintConfigItem> = [];

	if (Object.keys(nativeRules).length > 0) {
		fragments.push({
			name,
			...(excludeFiles ? { excludeFiles } : {}),
			files,
			...(globals ? { globals } : {}),
			plugins: nativePlugins,
			rules: nativeRules,
			...(settings ? { settings } : {}),
		});
	}

	if (Object.keys(jsPluginRules).length > 0) {
		fragments.push({
			name: `${name}/js-plugin`,
			...(excludeFiles ? { excludeFiles } : {}),
			files,
			...(globals && fragments.length === 0 ? { globals } : {}),
			jsPlugins,
			rules: jsPluginRules,
			...(settings && fragments.length === 0 ? { settings } : {}),
		});
	}

	return fragments;
}

function mappedTarget(rule: string): "js-plugin" | "native" {
	return oxlintRuleMapping[rule] === "js-plugin" ? "js-plugin" : "native";
}
