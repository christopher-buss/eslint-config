import { defineConfig } from "tsdown";

export default defineConfig({
	clean: true,
	entry: ["src/index.ts", "src/cli.ts"],
	format: ["esm"],
	// https://github.com/antfu/eslint-config-flat-gitignore/issues/18
	noExternal: ["eslint-config-flat-gitignore"],
	outputOptions: {
		inlineDynamicImports: true,
	},
	shims: true,
});
