import { isentinel } from "./src/oxlint/index.ts";

export default isentinel(
	{
		name: "project/options",
		ignores: ["fixtures", "_fixtures", "**/constants-generated.ts"],
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
		name: "local/src-overrides",
		files: ["src/**/*.ts"],
		rules: {
			"flawless/max-lines-per-function": "off",
			"max-lines": "off",
			// This package deliberately exposes its public API through barrel
			// index files.
			"oxc/no-barrel-file": "off",
			"sonar/cognitive-complexity": "off",
			"typescript/no-inferrable-types": "off",

			// Lots of configs are still untyped so we can't rely on this
			"typescript/no-unsafe-assignment": "off",
		},
	},
);
