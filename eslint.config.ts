import styleMigrate from "@stylistic/eslint-plugin-migrate";

import { isentinel } from "./src";

export default isentinel(
	{
		ignores: ["fixtures", "_fixtures", "**/constants-generated.ts"],
		pnpm: true,
		roblox: false,
		test: true,
		type: "package",
		typescript: {
			typeAware: false,
		},
	},
	{
		files: ["src/**/*.ts"],
		rules: {
			"max-lines": "off",
			"max-lines-per-function": "off",
			"sonar/cognitive-complexity": "off",
		},
	},
	{
		files: ["src/configs/*.ts"],
		plugins: {
			"style-migrate": styleMigrate,
		},
		rules: {
			"style-migrate/migrate": ["error", { namespaceTo: "style" }],
		},
	},
);
