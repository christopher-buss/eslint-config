import type { Linter } from "eslint";
import type { DummyRuleMap, OxlintConfig } from "oxlint";
import { defineConfig } from "oxlint";

import { oxlintPromise } from "./configs/promise";

export interface OxlintOptions {
	roblox?: boolean;
	type?: "app" | "game" | "package";
}

export interface OxlintConfigFragment {
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

export function isentinel(_options: OxlintOptions = {}): OxlintConfig {
	const configs: Array<OxlintConfigFragment> = [oxlintPromise()];

	// Merge all config fragments
	const plugins = new Set<OxlintPlugin>();
	let rules: DummyRuleMap = {};

	for (const config of configs) {
		for (const plugin of config.plugins ?? []) {
			plugins.add(plugin);
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
