import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const sharedOptions = {
	clean: true,
	format: ["esm"],
	outputOptions: {
		codeSplitting: false,
	},
	publint: true,
	shims: true,
} satisfies UserConfig;

export default defineConfig([
	{
		...sharedOptions,
		deps: {
			alwaysBundle: [
				// https://github.com/antfu/eslint-config-flat-gitignore/issues/18
				"eslint-config-flat-gitignore",
				// Bundled to ship patches/eslint-plugin-yml.patch
				"eslint-plugin-yml",
			],
			neverBundle: [
				/^@typescript-eslint\//,
				/^@eslint-react\//,
				/^@eslint-community\//,
				"zod",
				"type-fest",
				"eslint-visitor-keys",
				"eslint-plugin-erasable-syntax-only",
				"cached-factory",
			],
			onlyBundle: [
				"eslint-config-flat-gitignore",
				"@eslint/compat",
				// eslint-plugin-yml (see alwaysBundle) and its transitive tree
				"eslint-plugin-yml",
				"@eslint/plugin-kit",
				// cspell:disable-next-line
				"@ota-meshi/ast-token-store",
				"diff-sequences",
				"escape-string-regexp",
				// cspell:disable-next-line
				"levn",
				"natural-compare",
				"prelude-ls",
				"type-check",
			],
		},
		entry: ["src/index.ts"],
		unused: {
			// Required for cli
			ignore: ["ansis", "yargs", "concurrently", "file-entry-cache"],
			level: "warning",
		},
	},
	{
		...sharedOptions,
		// Source the CLI entry directly from the file that runs the yargs
		// instance. A barrel (`src/cli.ts`) would tree-shake the top-level
		// `void instance.argv` side effect away, emitting an empty
		// `dist/cli.mjs`.
		entry: { cli: "src/cli/index.ts" },
	},
	{
		...sharedOptions,
		// Shipped at dist/formatter-agents.mjs; the isentinel-lint CLI resolves
		// this exact path to pass it to `eslint --format`.
		entry: { "formatter-agents": "src/formatter-agents.ts" },
	},
	{
		...sharedOptions,
		// The lint runner shells out to the consumer's local eslint/oxlint and
		// resolves them at runtime, so its runtime deps stay external.
		entry: { "lint-cli": "src/lint-cli/index.ts" },
	},
	{
		...sharedOptions,
		// Shipped at dist/lint-ignored.mjs; the lint runner spawns this exact
		// path to ask the consumer's ESLint which targets it ignores.
		entry: { "lint-ignored": "src/lint-cli/ignored-child.ts" },
	},
	{
		...sharedOptions,
		deps: {
			neverBundle: [
				/^@typescript-eslint\//,
				/^@eslint-react\//,
				/^@eslint-community\//,
				"zod",
				"type-fest",
				"eslint-visitor-keys",
				"eslint-plugin-erasable-syntax-only",
				"cached-factory",
				"oxlint",
			],
		},
		entry: { oxlint: "src/oxlint/index.ts" },
	},
]);
