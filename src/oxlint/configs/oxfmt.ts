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
				rules: {
					...nativeRules,
					"arrow-body-style": "off",
					"prefer-arrow-callback": "off",
				},
			},
			{
				name: `${name}/js-plugin`,
				files,
				jsPlugins: [...jsPlugins, oxfmtPlugin],
				rules: {
					...jsPluginRules,
					"oxfmt/oxfmt": ["error", oxfmtOptions],
				},
			},
		];
	}

	return [
		...createFragments("isentinel/oxfmt/javascript", jsFiles),
		...createFragments("isentinel/oxfmt/typescript", tsFiles),
	];
}
