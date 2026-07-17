import { isentinel } from "./src/oxlint/index.ts";

export default isentinel(
	{
		name: "project/options",
		ignores: ["fixtures", "_fixtures", "**/constants-generated.ts"],
		roblox: false,
		type: "package",
		typescript: {
			erasableOnly: true,
		},
	},
	{
		name: "local/src-overrides",
		files: ["src/**/*.ts"],
		rules: {
			"max-lines": "off",
			"max-lines-per-function": "off",
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
