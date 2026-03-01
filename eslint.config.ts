import { isentinel } from "@isentinel/eslint-config";
import styleMigrate from "@stylistic/eslint-plugin-migrate";

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
		name: "local/src-overrides",
		files: ["src/**/*.ts"],
		rules: {
			// Temporary while migrating to oxlint
			"cease-nonsense/no-commented-code": "off",

			"max-lines": "off",
			"max-lines-per-function": "off",
			"sonar/cognitive-complexity": "off",

			"ts/no-inferrable-types": "off",

			// Lots of configs are still untyped so we can't rely on this
			"ts/no-unsafe-assignment": "off",
		},
	},
	{
		name: "local/style-migrate",
		files: ["src/configs/*.ts"],
		plugins: {
			"style-migrate": styleMigrate,
		},
		rules: {
			"style-migrate/migrate": ["error", { namespaceTo: "style" }],
		},
	},
);
