import { createRequire } from "node:module";
import type { FormatOptions as OxfmtOptions } from "oxfmt";

import { GLOB_JS, GLOB_JSX, GLOB_MARKDOWN, GLOB_TS, GLOB_TSX } from "../../globs.ts";
import { resolveWithDefaults } from "../../utils.ts";
import type {
	JsPluginRules,
	OptionsComponentExtensions,
	OptionsFiles,
	OxlintOptionsFormatters,
	TypedOxlintConfigItem,
} from "../types.ts";

const require = createRequire(import.meta.url);

export function oxfmt(
	options?: OptionsComponentExtensions &
		OptionsFiles & {
			formatters?: OxlintOptionsFormatters | true;
			oxfmtConfigOptions?: OxfmtOptions;
			oxfmtOptions?: OxfmtOptions;
			prettierOptions?: Record<string, unknown>;
		},
): Array<TypedOxlintConfigItem> {
	const {
		componentExts: componentExtensions = [],
		files: oxfmtFiles,
		formatters = {},
		oxfmtConfigOptions = {},
		oxfmtOptions: userOxfmtOptions,
		prettierOptions = {},
	} = options ?? {};

	const formattingOptions = {
		markdown: true,
		...resolveWithDefaults(formatters, {}),
	} satisfies OxlintOptionsFormatters;

	const defaultSortImports = {
		customGroups: [
			{ elementNamePattern: ["react"], groupName: "react" },
			{ elementNamePattern: ["@*/**"], groupName: "scoped" },
		],
		groups: [
			"react",
			"scoped",
			["type-builtin", "type-external", "builtin", "external"],
			[
				"type-internal",
				"internal",
				"type-parent",
				"type-sibling",
				"type-index",
				"parent",
				"sibling",
				"index",
			],
			"unknown",
		],
		newlinesBetween: true,
	};

	const oxfmtOptions = {
		sortImports: defaultSortImports,
		sortPackageJson: false,
		...migratePrettierOptions(prettierOptions),
		...oxfmtConfigOptions,
		...userOxfmtOptions,
	} satisfies OxfmtOptions;

	const oxfmtPlugin = [{ name: "oxfmt", specifier: "eslint-plugin-oxfmt" }] as const;

	// Disable rules that conflict with formatting — loaded sync via require()
	const configPrettier = require("eslint-config-prettier/flat") as {
		rules: Record<string, 0>;
	};

	// Only keep rules from plugins we actually use in oxlint configs.
	// Map eslint-config-prettier prefixes → oxlint jsPlugin names.
	const pluginRenaming: Record<string, string> = {
		"@stylistic": "style",
		"@stylistic/js": "style",
		"@stylistic/jsx": "style",
		"@stylistic/ts": "style",
	};

	// Plugins from eslint-config-prettier that don't exist in our oxlint setup.
	// @typescript-eslint stylistic rules were removed in v8 (migrated to
	// @stylistic).
	const ignoredPlugins = new Set([
		"@babel",
		"@typescript-eslint",
		"babel",
		"flowtype",
		"react",
		"standard",
		"vue",
	]);

	const rulesToIgnore = new Set(["curly", "style/func-call-spacing", "style/quotes"]);
	const prettierDisables: Record<string, "off"> = {};
	for (const key of Object.keys(configPrettier.rules)) {
		const slashIndex = key.lastIndexOf("/");
		if (slashIndex === -1) {
			if (!rulesToIgnore.has(key)) {
				prettierDisables[key] = "off";
			}

			continue;
		}

		const prefix = key.slice(0, slashIndex);
		if (ignoredPlugins.has(prefix)) {
			continue;
		}

		const ruleName = key.slice(slashIndex + 1);
		const renamed = pluginRenaming[prefix];
		const fullName = renamed !== undefined ? `${renamed}/${ruleName}` : `${prefix}/${ruleName}`;
		if (!rulesToIgnore.has(fullName)) {
			prettierDisables[fullName] = "off";
		}
	}

	const baseRules = {
		"oxfmt/oxfmt": ["error", oxfmtOptions],
	} satisfies JsPluginRules;

	const configs: Array<TypedOxlintConfigItem> = [];

	// Oxlint only supports JS/TS file types for jsPlugin rules.
	// CSS, HTML, GraphQL, JSON, YAML, TOML formatting is handled by
	// the ESLint oxfmt config instead.

	const jsFiles = oxfmtFiles?.flat() ?? [
		GLOB_JS,
		GLOB_JSX,
		`${GLOB_MARKDOWN}/${GLOB_JS}`,
		`${GLOB_MARKDOWN}/${GLOB_JSX}`,
	];

	configs.push({
		name: "isentinel/oxlint/oxfmt/javascript",
		files: jsFiles,
		jsPlugins: [...oxfmtPlugin],
		rules: {
			...prettierDisables,
			...baseRules,
			"eslint/arrow-body-style": "off",
			"eslint/prefer-arrow-callback": "off",
		},
	});

	const tsFiles: Array<string> = oxfmtFiles?.flat() ?? [
		GLOB_TS,
		GLOB_TSX,
		`${GLOB_MARKDOWN}/${GLOB_TS}`,
		`${GLOB_MARKDOWN}/${GLOB_TSX}`,
		...componentExtensions.map((extension) => `**/*.${extension}`),
	];

	configs.push({
		name: "isentinel/oxlint/oxfmt/typescript",
		files: tsFiles,
		jsPlugins: [...oxfmtPlugin],
		rules: {
			...prettierDisables,
			...baseRules,
			"eslint/arrow-body-style": "off",
			"eslint/prefer-arrow-callback": "off",
		},
	});

	if (formattingOptions.markdown) {
		configs.push({
			name: "isentinel/oxlint/oxfmt/markdown",
			files: [GLOB_MARKDOWN],
			jsPlugins: [...oxfmtPlugin],
			rules: {
				"oxfmt/oxfmt": [
					"error",
					{
						...oxfmtOptions,
						printWidth: Number(prettierOptions["jsdocPrintWidth"]) || 80,
						proseWrap: "always",
					},
				],
			} satisfies JsPluginRules,
		});
	}

	return configs;
}

const UNSUPPORTED_PRETTIER_KEYS = new Set([
	"experimentalOperatorPosition",
	"experimentalTernaries",
	"jsdocPreferCodeFences",
	"jsdocPrintWidth",
	"parser",
	"plugins",
	"tsdoc",
]);

function migratePrettierOptions(prettierOptions: Record<string, unknown>): Record<string, unknown> {
	const oxfmtOptions: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(prettierOptions)) {
		if (UNSUPPORTED_PRETTIER_KEYS.has(key)) {
			continue;
		}

		if (key === "endOfLine" && value === "auto") {
			continue;
		}

		oxfmtOptions[key] = value;
	}

	return oxfmtOptions;
}
