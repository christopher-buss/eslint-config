import { isentinel } from "./src/oxlint/index.ts";

export default isentinel(
	{
		name: "project/options",
		ignores: ["fixtures", "_fixtures", "**/constants-generated.ts"],
		// Experiment: oxlint runs its native rules only; everything a jsPlugin
		// would run stays in ESLint (`oxlint: "native"` there).
		jsPlugins: false,
		roblox: false,
		// Must mirror the `test` option in eslint.config.ts: hybrid mode drops
		// the jsPlugin-mapped test rules from ESLint, so if oxlint does not
		// build a test config they run in neither linter.
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
		name: "local/test-overrides",
		files: ["test/**/*.ts"],
		rules: {
			// The parity and snapshot suites iterate the whole rule mapping and
			// accumulate problems, so branching and long assertion runs are
			// inherent to their shape rather than a smell.
			"vitest/max-expects": "off",
		},
	},
	{
		name: "local/entrypoint-overrides",
		files: [
			"src/index.ts",
			"src/eslint/index.ts",
			"src/oxlint/index.ts",
			"src/formatter-agents.ts",
		],
		rules: {
			// `export *` does not re-export `default`, so the barrel's single
			// default export is not a duplicate. See oxc-project/oxc.
			"import/export": "off",
			// The published entrypoints and the ESLint formatter API are
			// default-export contracts.
			"import/no-default-export": "off",
		},
	},
	{
		name: "local/src-overrides",
		files: ["src/**/*.ts"],
		rules: {
			// `flawless/max-lines-per-function` and `sonar/cognitive-complexity`
			// live in eslint.config.ts: native-only mode runs no jsPlugins, so
			// oxlint would reject the unknown plugins.
			"max-lines": "off",
			// This package deliberately exposes its public API through barrel
			// index files.
			"oxc/no-barrel-file": "off",
			"typescript/no-inferrable-types": "off",

			// Lots of configs are still untyped so we can't rely on this
			"typescript/no-unsafe-assignment": "off",
		},
	},
);
