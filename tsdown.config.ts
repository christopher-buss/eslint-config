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
			ignore: ["ansis", "yargs"],
			level: "warning",
		},
	},
	{
		...sharedOptions,
		entry: ["src/cli.ts"],
	},
]);
