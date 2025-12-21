import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const sharedOptions = {
	clean: true,
	format: ["esm"],
	outputOptions: {
		inlineDynamicImports: true,
	},
	publint: true,
	shims: true,
} satisfies UserConfig;

export default defineConfig([
	{
		...sharedOptions,
		entry: ["src/index.ts"],
		// https://github.com/antfu/eslint-config-flat-gitignore/issues/18
		noExternal: ["eslint-config-flat-gitignore"],
		unused: {
			// Required for shopify, and cli
			ignore: ["eslint-import-resolver-node", "ansis", "yargs"],
			level: "warning",
		},
	},
	{
		...sharedOptions,
		entry: ["src/cli.ts"],
	},
]);
