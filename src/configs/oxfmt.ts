import type { Options as PrettierOptions } from "prettier";

import { defaultPluginRenaming } from "../factory";
import { GLOB_JS, GLOB_JSX, GLOB_MARKDOWN, GLOB_TS, GLOB_TSX } from "../globs";
import type {
	FormatterEngine,
	OptionsComponentExtensions,
	OptionsFiles,
	OptionsOverrides,
	OxfmtOptions,
	TypedFlatConfigItem,
} from "../types";
import { interopDefault, renameRules } from "../utils";

export async function oxfmt(
	options?: OptionsComponentExtensions &
		OptionsFiles &
		OptionsOverrides & {
			jsFormatter?: FormatterEngine;
			oxfmtOptions?: OxfmtOptions;
			prettierOptions?: PrettierOptions;
			tsFormatter?: FormatterEngine;
		},
): Promise<Array<TypedFlatConfigItem>> {
	const {
		componentExts: componentExtensions = [],
		files: oxfmtFiles,
		jsFormatter = "oxfmt",
		oxfmtOptions: userOxfmtOptions,
		prettierOptions = {},
		tsFormatter = "oxfmt",
	} = options ?? {};

	const oxfmtOptions = {
		...migratePrettierOptions(prettierOptions),
		...userOxfmtOptions,
	};

	const [configPrettier, pluginOxfmt] = await Promise.all([
		interopDefault(import("eslint-config-prettier/flat")),
		interopDefault(import("eslint-plugin-oxfmt")),
	]);

	const rulesToIgnore = ["curly", "style/quotes"];
	const rules = renameRules(configPrettier.rules, defaultPluginRenaming);
	for (const rule of rulesToIgnore) {
		delete rules[rule];
	}

	const configs: Array<TypedFlatConfigItem> = [
		{
			name: "isentinel/oxfmt/setup",
			plugins: {
				oxfmt: pluginOxfmt,
			},
		},
	];

	if (jsFormatter === "oxfmt") {
		const jsFiles = oxfmtFiles ?? [
			GLOB_JS,
			GLOB_JSX,
			`${GLOB_MARKDOWN}/${GLOB_JS}`,
			`${GLOB_MARKDOWN}/${GLOB_JSX}`,
		];

		configs.push({
			name: "isentinel/oxfmt/javascript",
			files: jsFiles,
			rules: {
				...rules,
				"arrow-body-style": "off",
				"format/prettier": "off",
				"oxfmt/oxfmt": ["error", oxfmtOptions],
				"prefer-arrow-callback": "off",
			},
		});
	}

	if (tsFormatter === "oxfmt") {
		const tsFiles = oxfmtFiles ?? [
			GLOB_TS,
			GLOB_TSX,
			`${GLOB_MARKDOWN}/${GLOB_TS}`,
			`${GLOB_MARKDOWN}/${GLOB_TSX}`,
			...componentExtensions.map((extension) => `**/*.${extension}`),
		];

		configs.push({
			name: "isentinel/oxfmt/typescript",
			files: tsFiles,
			rules: {
				...rules,
				"arrow-body-style": "off",
				"format/prettier": "off",
				"oxfmt/oxfmt": ["error", oxfmtOptions],
				"prefer-arrow-callback": "off",
			},
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

function migratePrettierOptions(prettierOptions: PrettierOptions): Record<string, unknown> {
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
