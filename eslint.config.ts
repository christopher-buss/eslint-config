import styleMigrate from "@stylistic/eslint-plugin-migrate";

import { isentinel } from "./src";

export default isentinel(
	{
		name: "project/options",
		ignores: ["fixtures", "_fixtures", "**/constants-generated.ts"],
		namedConfigs: true,
		oxlint: true,
		pnpm: true,
		roblox: false,
		test: {
			vitest: {
				typecheck: true,
			},
		},
		type: "package",
		typescript: {
			erasableOnly: true,
		},
	},
	{
		name: "local/style-migrate",
		files: ["src/eslint/configs/*.ts"],
		plugins: {
			"style-migrate": styleMigrate,
		},
		rules: {
			"style-migrate/migrate": ["error", { namespaceTo: "style" }],
		},
	},
);
