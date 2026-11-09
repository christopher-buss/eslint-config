import styleMigrate from "@stylistic/eslint-plugin-migrate";

import { isentinel } from "./src/index.ts";

export default isentinel(
	{
		name: "project/options",
		ignores: ["fixtures", "_fixtures", "src/generated", "**/*-generated.ts"],
		namedConfigs: true,
		oxlint: "native",
		pnpm: true,
		roblox: false,
		test: {
			vitest: {
				typecheck: true,
			},
		},
		type: "package",
		typescript: {
			erasableOnly: true,
			// The tsconfig includes root files, so only the inspector config
			// (excluded there, as it imports the built package) sits outside.
			outOfProjectFiles: ["eslint-inspector.config.ts"],
		},
	},
	{
		name: "local/src-overrides",
		files: ["src/**/*.ts"],
		rules: {
			"flawless/cognitive-complexity": "off",
			// Native-only hybrid keeps the jsPlugin rules here, so their
			// project-level disables live here too (the native counterparts
			// stay in oxlint.config.ts).
			"flawless/max-lines-per-function": "off",
		},
	},
	{
		name: "local/require-async-suffix",
		files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
		rules: {
			"small-rules/require-async-suffix": "off",
		},
	},
	{
		name: "local/formatter",
		files: ["src/formatter-agents.ts"],
		rules: {
			// ESLint resolves formatters by file name, so this one cannot be
			// renamed to match its default export.
			"sonar/file-name-differ-from-class": "off",
		},
	},
	{
		name: "local/pnpm-plugin",
		files: ["pnpm-plugin/**/*.mjs"],
		rules: {
			// The plugin ships as plain JavaScript, so JSDoc carries its types.
			"jsdoc/no-types": "off",
			"jsdoc/no-undefined-types": "off",
		},
	},
	{
		name: "local/pnpm-plugin-manifest",
		files: ["pnpm-plugin/package.json"],
		rules: {
			// pnpm loads the plugin by path; nothing imports it as a library.
			"package-json/require-types": "off",
		},
	},
	{
		name: "local/style-migrate",
		files: ["src/eslint/configs/*.ts"],
		plugins: {
			"style-migrate": styleMigrate,
		},
		rules: {
			"style-migrate/migrate": ["error", { namespaceTo: "style" }],
		},
	},
);
