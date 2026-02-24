import { isentinel } from "./src/oxlint.ts";

export default isentinel(
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
);
