import { defineConfig } from "tsdown";

export default defineConfig({
	deps: {
		// https://github.com/antfu/eslint-config-flat-gitignore/issues/18
		alwaysBundle: ["eslint-config-flat-gitignore"],
	},
	entry: {
		cli: "src/cli.ts",
		eslint: "src/index.ts",
		index: "src/index.ts",
		oxlint: "src/oxlint.ts",
	},
	exports: true,
	format: ["esm"],
	publint: true,
	shims: true,
});
