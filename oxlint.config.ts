import { defineConfig } from "oxlint";

import { isentinel } from "./src/oxlint/index.ts";

export default defineConfig(
	isentinel(
		{
			name: "project/options",
			roblox: false,
			type: "package",
		},
		{
			name: "local/src-overrides",
			files: ["src/**/*.ts"],
			rules: {
				"max-lines": "off",
				"max-lines-per-function": "off",
				"sonar/cognitive-complexity": "off",
				"typescript/no-inferrable-types": "off",
			},
		},
	),
);
