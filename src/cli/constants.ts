import ansis from "ansis";

import type { FrameworkOption, PromItem } from "./types";

export const vscodeSettingsString = `
  // Disable the default formatter, use eslint instead
  "prettier.enable": false,
  "editor.formatOnSave": false,

  // Auto fix
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "never"
  },

  // Silent the stylistic rules in you IDE, but still auto fix them
  "eslint.rules.customizations": [
    { "rule": "style/*", "severity": "off", "fixable": true },
    { "rule": "format/*", "severity": "off", "fixable": true },
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
	react: ["@eslint-react/eslint-plugin", "eslint-plugin-react-hooks"],
	test: ["eslint-plugin-jest"],
} as const;

export { default as pkgJson } from "../../package.json";
