import { flatConfigsToRulesDTS } from "eslint-typegen/core";
import { builtinRules } from "eslint/use-at-your-own-risk";
import fs from "node:fs/promises";

import {
	combine,
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
	pnpm(),
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

const configNames = configs.map((index) => index.name).filter(Boolean) as Array<string>;

let dts = await flatConfigsToRulesDTS(configs, {
	includeAugmentation: false,
});

dts += `
// Names of all the configs
export type ConfigNames = ${configNames.map((index) => `'${index}'`).join(" | ")}
`;

await fs.writeFile("src/typegen.d.ts", dts);
