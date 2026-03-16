import type { DummyRuleMap } from "oxlint";

export interface OxlintOptions {
	isInEditor?: boolean;
	jsdoc?: boolean;
	roblox?: boolean;
	root?: Array<string>;
	rules?: DummyRuleMap;
	stylistic?: boolean;
	type?: "app" | "game" | "package";
	vitest?: boolean;
}

export type OxlintPlugin =
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

export type * from "../types.ts";

export type { OxlintOverride } from "oxlint";
