import { flatConfigsToRulesDTS } from "eslint-typegen/core";
import { builtinRules } from "eslint/use-at-your-own-risk";
import fs from "node:fs/promises";

import {
	comments,
	eslintPlugin,
	flawless,
	gitignore,
	ignores,
	imports,
	javascript,
	jsdoc,
	jsonc,
	markdown,
	node,
	packageJson,
	perfectionist,
	pnpm,
	prettier,
	promise,
	react,
	roblox,
	shopify,
	sonarjs,
	spelling,
	stylistic,
	test,
	toml,
	typescript,
	unicorn,
	yaml,
} from "../src";
import { combine } from "../src/utils";

const configs = await combine(
	{
		plugins: {
			"": {
				rules: Object.fromEntries(builtinRules.entries()),
			},
		},
	},
	comments(),
	eslintPlugin(),
	flawless(),
	gitignore(),
	ignores(),
	imports(),
	javascript(),
	jsdoc(),
	jsonc(),
	markdown(),
	node(),
	packageJson(),
	perfectionist(),
	pnpm({ isInEditor: false }),
	prettier(),
	promise(),
	react(),
	roblox(),
	shopify(),
	sonarjs({ isInEditor: false }),
	spelling(),
	stylistic(),
	test({ jest: true, vitest: true }),
	toml(),
	typescript({ erasableOnly: true }),
	unicorn(),
	yaml(),
);

const configNames = configs.map((config) => config.name).filter(Boolean) as Array<string>;

let dts = await flatConfigsToRulesDTS(configs, {
	includeAugmentation: false,
});

dts += `
// Names of all the configs
export type ConfigNames = ${configNames.map((name) => `'${name}'`).join(" | ")}
`;

await fs.writeFile("src/typegen.d.ts", dts);
