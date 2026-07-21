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

/**
 * Every shipped entry, in one place. The unused-dependency check builds all of
 * them together so a dependency used by any single entry counts as used.
 */
const entries = {
	"cli": "src/cli/index.ts",
	"formatter-agents": "src/formatter-agents.ts",
	"index": "src/index.ts",
	"lint-cli": "src/lint-cli/index.ts",
	"lint-ignored": "src/lint-cli/ignored-child.ts",
	"oxlint": "src/oxlint/index.ts",
} satisfies Record<string, string>;

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
		entry: [entries.index],
	},
	{
		...sharedOptions,
		// Source the CLI entry directly from the file that runs the yargs
		// instance. A barrel (`src/cli.ts`) would tree-shake the top-level
		// `void instance.argv` side effect away, emitting an empty
		// `dist/cli.mjs`.
		entry: { cli: entries.cli },
	},
	{
		...sharedOptions,
		// Shipped at dist/formatter-agents.mjs; the isentinel-lint CLI resolves
		// this exact path to pass it to `eslint --format`.
		entry: { "formatter-agents": entries["formatter-agents"] },
	},
	{
		...sharedOptions,
		// The lint runner shells out to the consumer's local eslint/oxlint and
		// resolves them at runtime, so its runtime deps stay external.
		entry: { "lint-cli": entries["lint-cli"] },
	},
	{
		...sharedOptions,
		// Shipped at dist/lint-ignored.mjs; the lint runner spawns this exact
		// path to ask the consumer's ESLint which targets it ignores.
		entry: { "lint-ignored": entries["lint-ignored"] },
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
		entry: { oxlint: entries.oxlint },
	},
	{
		// Dependency-usage check only: unplugin-unused inspects a single
		// rolldown graph, so a dependency imported by only one entry looks
		// unused to every other entry's build. Bundling all entries at once is
		// the only way it sees the whole picture. Nothing here is shipped, so
		// the output goes to a cache dir, declarations are skipped, and no
		// dependency is bundled - the plugin only needs to read our own
		// sources to spot the imports.
		clean: true,
		deps: { skipNodeModulesBundle: true },
		dts: false,
		entry: entries,
		format: ["esm"],
		outDir: "node_modules/.cache/tsdown-unused",
		publint: false,
		unused: { level: "warning" },
	},
]);
