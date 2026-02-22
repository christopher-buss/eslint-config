import { isentinel } from "@isentinel/eslint-config/oxlint";

export default isentinel(
	{
		roblox: false,
		type: "package",
	},
	{
		files: ["src/**/*.ts"],
		rules: {
			"sonar/cognitive-complexity": "off",
		},
	},
);
