import type { Linter } from "eslint";
import type { DummyRuleMap, ExternalPluginEntry, OxlintConfig, OxlintOverride } from "oxlint";
import { defineConfig } from "oxlint";

import { oxlintPromise } from "./configs/promise";
import { oxlintSonarjs } from "./configs/sonarjs";

export interface OxlintOptions {
	isInEditor?: boolean;
	roblox?: boolean;
	type?: "app" | "game" | "package";
}

export interface OxlintConfigFragment {
	jsPlugins?: Array<ExternalPluginEntry>;
	plugins?: Array<OxlintPlugin>;
	rules: DummyRuleMap;
}

type OxlintPlugin =
	| "eslint"
	| "import"
	| "jest"
	| "jsdoc"
	| "jsx-a11y"
	| "nextjs"
	| "node"
	| "oxc"
	| "promise"
	| "react"
	| "react-perf"
	| "typescript"
	| "unicorn"
	| "vitest"
	| "vue";

type RuleEntry = Linter.RuleEntry<any>;

export function isentinel(
	options: OxlintOptions = {},
	...userConfigs: Array<OxlintOverride>
): OxlintConfig {
	const { isInEditor = false } = options;

	const configs: Array<OxlintConfigFragment> = [oxlintPromise(), oxlintSonarjs({ isInEditor })];

	// Merge all config fragments
	const plugins = new Set<OxlintPlugin>();
	const jsPlugins = new Map<string, ExternalPluginEntry>();
	let rules: DummyRuleMap = {};

	for (const config of configs) {
		for (const plugin of config.plugins ?? []) {
			plugins.add(plugin);
		}

		for (const jsPlugin of config.jsPlugins ?? []) {
			const key = typeof jsPlugin === "string" ? jsPlugin : jsPlugin.specifier;
			jsPlugins.set(key, jsPlugin);
		}

		rules = { ...rules, ...filterRules(config.rules) };
	}

	return defineConfig({
		categories: {
			correctness: "off",
			nursery: "off",
			pedantic: "off",
			perf: "off",
			restriction: "off",
			style: "off",
			suspicious: "off",
		},
		jsPlugins: [...jsPlugins.values()],
		overrides: userConfigs,
		plugins: [...plugins],
		rules,
	});
}

function isOff(entry: RuleEntry | undefined): boolean {
	if (entry === undefined || entry === "off" || entry === 0) {
		return true;
	}

	if (Array.isArray(entry)) {
		return entry[0] === "off" || entry[0] === 0;
	}

	return false;
}

function filterRules(rules: DummyRuleMap): DummyRuleMap {
	const filtered: DummyRuleMap = {};
	for (const [key, value] of Object.entries(rules)) {
		if (!isOff(value as RuleEntry | undefined)) {
			filtered[key] = value;
		}
	}

	return filtered;
}
