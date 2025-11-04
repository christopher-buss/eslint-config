import { defineConfig } from "tsdown";

export default defineConfig({
	clean: true,
	entry: ["src/index.ts", "src/cli.ts"],
	format: ["esm"],
	outputOptions: {
		inlineDynamicImports: true,
	},
	shims: true,
});
