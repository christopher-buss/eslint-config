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
		entry: ["src/index.ts"],
		external: [
			/^@typescript-eslint\//,
			/^@eslint-react\//,
			/^@eslint-community\//,
			"zod",
			"type-fest",
			"eslint-visitor-keys",
			"eslint-plugin-erasable-syntax-only",
			"cached-factory",
		],
		inlineOnly: ["eslint-config-flat-gitignore"],
		// https://github.com/antfu/eslint-config-flat-gitignore/issues/18
		noExternal: ["eslint-config-flat-gitignore"],
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
