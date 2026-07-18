import { isPackageExists } from "local-pkg";
import type { ExternalPluginEntry } from "oxlint";

import {
	collapsesToTsCoreRule,
	excludedFromOxlint,
	isOxlintCovered,
	isTsCoreCounterpartRule,
	oxlintJsPlugins,
	oxlintRuleMapping,
	translateRuleToOxlint,
} from "../rules/oxlint-mapping.ts";
import type { Rules } from "../types.ts";
import type { OxlintPlugin, TypedOxlintConfigItem } from "./types.ts";

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
	globals?: NonNullable<TypedOxlintConfigItem["globals"]>;
	keepUnmappedOff?: boolean;
	rules: Rules | undefined;
	settings?: NonNullable<TypedOxlintConfigItem["settings"]>;
}

/**
 * Split a canonical (ESLint-named) rule map into oxlint-native rules and
 * jsPlugin rules, translating rule names via the oxlint rule mapping.
 *
 * Rules that are not part of the hybrid mapping (for example jest or react
 * rules, which only run in standalone mode) are treated as jsPlugin rules.
 * Disabled unmapped rules are skipped so that no jsPlugin is loaded solely for
 * an "off" entry, unless `keepUnmappedOff` is set (user options.rules must not
 * silently discard an explicit disable).
 *
 * @param rules - The canonical rule map.
 * @param keepUnmappedOff - Emit disabled unmapped rules instead of skipping
 *   them (without registering a jsPlugin for them).
 * @returns The split rules with the plugins each side requires.
 */
export function splitOxlintRules(
	rules: Rules | undefined,
	keepUnmappedOff = false,
): SplitOxlintRules {
	const nativeRules: Rules = {};
	const jsPluginRules: Rules = {};
	const nativePlugins = new Set<OxlintPlugin>();
	const jsPluginPrefixes = new Set<string>();
	const tsCollapsed = new Set<string>();

	const entries = Object.entries(rules ?? {});
	for (const [rule, value] of entries) {
		if (value === undefined || excludedFromOxlint.has(rule)) {
			continue;
		}

		const covered = isOxlintCovered(rule);
		const severity = Array.isArray(value) ? value[0] : value;
		const isOff = severity === "off" || severity === 0;
		const translated = translateRuleToOxlint(rule);

		const slashIndex = translated.indexOf("/");
		const prefix = slashIndex === -1 ? "eslint" : translated.slice(0, slashIndex);
		// Unmapped rules whose translated prefix is a native oxlint plugin (for
		// example oxc/*, which has no ESLint equivalent to map) run natively:
		// they need no jsPlugin specifier and must not be routed as jsPlugin
		// rules, which would throw on the missing specifier.
		const isNativePrefix = NATIVE_PLUGINS.has(prefix as OxlintPlugin);

		if (!covered && isOff && keepUnmappedOff) {
			// Preserve an explicit disable. A native-prefix disable is kept and
			// registers its (always-available) native plugin, which lets a
			// config disable an unmapped native-only rule such as oxc/* for
			// specific files. A jsPlugin disable is kept only when the plugin is
			// installed, since oxlint errors the whole config build both on an
			// unregistered plugin and on a registered-but-unresolvable one.
			if (isNativePrefix) {
				nativeRules[translated] = value;
				nativePlugins.add(prefix as OxlintPlugin);
			} else {
				const specifier = oxlintJsPlugins[prefix];
				if (specifier !== undefined && isPackageExists(specifier)) {
					jsPluginRules[translated] = value;
					jsPluginPrefixes.add(prefix);
				}
			}

			continue;
		}

		if (!covered && isOff) {
			continue;
		}

		const uncoveredTarget = isNativePrefix ? "native" : "js-plugin";
		const target = covered ? mappedTarget(rule) : uncoveredTarget;

		if (target === "js-plugin") {
			jsPluginRules[translated] = value;
			jsPluginPrefixes.add(prefix);
			continue;
		}

		if (collapsesToTsCoreRule(rule)) {
			tsCollapsed.add(translated);
			nativeRules[translated] = value;
		} else if (!isTsCoreCounterpartRule(rule) || !tsCollapsed.has(translated)) {
			nativeRules[translated] = value;
		}

		if (isNativePrefix) {
			nativePlugins.add(prefix as OxlintPlugin);
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
	keepUnmappedOff = false,
	rules,
	settings,
}: OxlintConfigFragmentOptions): Array<TypedOxlintConfigItem> {
	const { jsPluginRules, jsPlugins, nativePlugins, nativeRules } = splitOxlintRules(
		rules,
		keepUnmappedOff,
	);

	const fragments: Array<TypedOxlintConfigItem> = [];

	if (Object.keys(nativeRules).length > 0) {
		fragments.push({
			name,
			...(excludeFiles ? { excludeFiles } : {}),
			files,
			...(globals ? { globals } : {}),
			plugins: nativePlugins,
			// The split rules are keyed by translated oxlint names, which the
			// eslint-side `Rules` typing cannot express.
			rules: nativeRules as TypedOxlintConfigItem["rules"],
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
			rules: jsPluginRules as TypedOxlintConfigItem["rules"],
			...(settings && fragments.length === 0 ? { settings } : {}),
		});
	}

	return fragments;
}

function mappedTarget(rule: string): "js-plugin" | "native" {
	return oxlintRuleMapping[rule] === "js-plugin" ? "js-plugin" : "native";
}
