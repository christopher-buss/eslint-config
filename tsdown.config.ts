import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const sharedOptions = {
	checks: { importIsUndefined: false },
	clean: true,
	inlineOnly: false,
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
