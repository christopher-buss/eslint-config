import { createRequire } from "node:module";

import { defaultPluginRenaming } from "../../eslint/plugin-renaming.ts";
import { GLOB_JS, GLOB_JSX, GLOB_TS, GLOB_TSX } from "../../globs.ts";
import type { OptionsComponentExtensions, OptionsFiles, Rules } from "../../types.ts";
import { renameRules } from "../../utils.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { splitOxlintRules } from "../utils.ts";

const require = createRequire(import.meta.url);

export function oxlintOxfmt(
	options?: OptionsComponentExtensions &
		OptionsFiles & {
			oxfmtOptions?: Record<string, unknown>;
		},
): Array<TypedOxlintConfigItem> {
	const {
		componentExts: componentExtensions = [],
		files: oxfmtFiles,
		oxfmtOptions = {},
	} = options ?? {};

	// Disable rules that conflict with formatting — loaded sync via require()
	const configPrettier = require("eslint-config-prettier/flat") as {
		rules: Record<string, 0>;
	};

	const rulesToIgnore = new Set(["curly", "style/quotes"]);
	const canonicalDisables: Rules = {};
	const prettierRuleNames = Object.keys(renameRules(configPrettier.rules, defaultPluginRenaming));
	for (const key of prettierRuleNames) {
		if (!rulesToIgnore.has(key)) {
			canonicalDisables[key] = "off";
		}
	}

	// Translate the prettier disables to oxlint rule names; unmapped "off"
	// rules are dropped by the splitter.
	const { jsPluginRules, jsPlugins, nativeRules } = splitOxlintRules(canonicalDisables);

	// The splitter drops unmapped "off" rules, but the `@stylistic` disables
	// must survive: other configs (react, user overrides) enable unmapped
	// `style/*` rules that ESLint's formatter-compat layer turns off, and this
	// config runs last to mirror that (e.g. `style/jsx-newline`). Names are
	// checked against the plugin so oxlint never sees an unknown rule.
	const stylisticPlugin = require("@stylistic/eslint-plugin") as {
		rules: Record<string, unknown>;
	};
	for (const [rule, value] of Object.entries(canonicalDisables)) {
		if (!rule.startsWith("style/") || jsPluginRules[rule] !== undefined) {
			continue;
		}

		if (stylisticPlugin.rules[rule.slice("style/".length)] !== undefined) {
			jsPluginRules[rule] = value;
		}
	}

	const hasStylePlugin = jsPlugins.some(
		(plugin) => typeof plugin !== "string" && plugin.name === "style",
	);
	if (!hasStylePlugin) {
		jsPlugins.push({ name: "style", specifier: "@stylistic/eslint-plugin" });
	}

	const oxfmtPlugin = { name: "oxfmt", specifier: "eslint-plugin-oxfmt" };

	const jsFiles = oxfmtFiles?.flat() ?? [GLOB_JS, GLOB_JSX];
	const tsFiles = oxfmtFiles?.flat() ?? [
		GLOB_TS,
		GLOB_TSX,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	function createFragments(name: string, files: Array<string>): Array<TypedOxlintConfigItem> {
		return [
			{
				name,
				files,
				// The split rules are keyed by translated oxlint names, which
				// the eslint-side `Rules` typing cannot express.
				rules: {
					...nativeRules,
					"arrow-body-style": "off",
					"prefer-arrow-callback": "off",
				} as TypedOxlintConfigItem["rules"],
			},
			{
				name: `${name}/js-plugin`,
				files,
				jsPlugins: [...jsPlugins, oxfmtPlugin],
				rules: {
					...jsPluginRules,
					"oxfmt/oxfmt": ["error", oxfmtOptions],
				} as TypedOxlintConfigItem["rules"],
			},
		];
	}

	return [
		...createFragments("isentinel/oxfmt/javascript", jsFiles),
		...createFragments("isentinel/oxfmt/typescript", tsFiles),
	];
}
