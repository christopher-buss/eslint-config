import styleMigrate from "@stylistic/eslint-plugin-migrate";

import { isentinel } from "./src/index.ts";

export default isentinel(
	{
		name: "project/options",
		ignores: ["fixtures", "_fixtures", "**/constants-generated.ts"],
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
		},
	},
	{
		name: "local/src-overrides",
		files: ["src/**/*.ts"],
		rules: {
			// Native-only hybrid keeps the jsPlugin rules here, so their
			// project-level disables live here too (the native counterparts
			// stay in oxlint.config.ts).
			"flawless/max-lines-per-function": "off",
			"sonar/cognitive-complexity": "off",
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
