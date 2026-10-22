import ansis from "ansis";

import { OXFMT_CONFIG_MODULE } from "../utils.ts";
import type { FormatterMode, FrameworkOption, PromItem } from "./types.ts";

/** The VS Code extension that runs oxfmt. */
export const OXC_VSCODE_EXTENSION = "oxc.oxc-vscode";

/** Languages oxfmt formats on save in the standalone setup. */
const OXFMT_LANGUAGES = [
	"css",
	"graphql",
	"html",
	"javascript",
	"javascriptreact",
	"json",
	"jsonc",
	"less",
	"markdown",
	"scss",
	"typescript",
	"typescriptreact",
	"yaml",
];

const eslintFormatterSettings = `
  // Disable the default formatter, use eslint instead
  "prettier.enable": false,
  "editor.formatOnSave": false,
`;

const standaloneFormatterSettings = `
  // Format with oxfmt; eslint only lints
  "prettier.enable": false,
  "eslint.format.enable": false,
${OXFMT_LANGUAGES.map((language) => {
	return `  "[${language}]": {
    "editor.defaultFormatter": "${OXC_VSCODE_EXTENSION}",
    "editor.formatOnSave": true
  },`;
}).join("\n")}
`;

const lintSettings = `
  // Auto fix
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "never"
  },

  // Silent the stylistic rules in you IDE, but still auto fix them
  "eslint.rules.customizations": [
    { "rule": "style/*", "severity": "off", "fixable": true },
    { "rule": "format/*", "severity": "off", "fixable": true },
    { "rule": "*fmt/*", "severity": "off", "fixable": true },
    { "rule": "*-indent", "severity": "off", "fixable": true },
    { "rule": "*-spacing", "severity": "off", "fixable": true },
    { "rule": "*-spaces", "severity": "off", "fixable": true },
    { "rule": "*-order", "severity": "off", "fixable": true },
    { "rule": "*-dangle", "severity": "off", "fixable": true },
    { "rule": "*-newline", "severity": "off", "fixable": true },
    { "rule": "*quotes", "severity": "off", "fixable": true },
    { "rule": "*semi", "severity": "off", "fixable": true }
  ],

  // Enable eslint for all supported languages
  "eslint.validate": [
    "typescript",
    "typescriptreact",
    "markdown",
    "json",
    "jsonc",
    "yaml",
	  "toml",
	  "luau"
  ]
`;

/**
 * The VS Code settings the wizard adds, as the body of a JSON object.
 *
 * @param formatter - Where formatting runs.
 * @returns The settings text.
 */
export function vscodeSettingsString(formatter: FormatterMode = "eslint"): string {
	return `${formatter === "standalone" ? standaloneFormatterSettings : eslintFormatterSettings}${lintSettings}`;
}

export const formatterOptions: Array<PromItem<FormatterMode>> = [
	{
		hint: "oxfmt runs as an ESLint rule",
		label: "ESLint",
		value: "eslint",
	},
	{
		hint: `oxfmt runs as its own tool, with ${OXFMT_CONFIG_MODULE}`,
		label: "Standalone oxfmt",
		value: "standalone",
	},
];

/** The {@link OXFMT_CONFIG_MODULE} the standalone setup writes. */
export const OXFMT_CONFIG_CONTENT = `import { isentinelOxfmt } from "@isentinel/eslint-config/oxfmt";

export default isentinelOxfmt();
`;

export const frameworkOptions: Array<PromItem<FrameworkOption>> = [
	{
		label: ansis.red("Test"),
		value: "test",
	},
	{
		label: ansis.cyan("React"),
		value: "react",
	},
];

export const frameworks: Array<FrameworkOption> = frameworkOptions.map(({ value }) => value);

export const dependenciesMap = {
	react: [
		"eslint-plugin-react-x",
		"eslint-plugin-react-jsx",
		"eslint-plugin-react-naming-convention",
	],
	test: ["eslint-plugin-jest"],
} as const;

export { default as pkgJson } from "../../package.json" with { type: "json" };
