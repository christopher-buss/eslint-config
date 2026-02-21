import { flatConfigsToRulesDTS } from "eslint-typegen/core";
import { builtinRules } from "eslint/use-at-your-own-risk";
import fs from "node:fs/promises";

import {
	ceaseNonsense,
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
	ceaseNonsense(),
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

// Fix valid-title types: json-schema-to-typescript-lite converts
// patternProperties to an index signature [k: string] which conflicts with the
// boolean properties. Replace with explicit mustMatch/mustNotMatch properties to
// match upstream schema.
const validTitleMatchType = `mustMatch?: string | [string] | [string, string] | {
    [k: string]: (string | [string] | [string, string]) | undefined
  }
  mustNotMatch?: string | [string] | [string, string] | {
    [k: string]: (string | [string] | [string, string]) | undefined
  }`;

dts = dts.replace(
	/(\n\/\/ ----- (?:test|vitest)\/valid-title -----\ntype \w+ValidTitle = \[\]\|\[\{[^}]*?)\[k: string\]: \(string \| \[string\]\|\[string, string\] \| \{\n\s+\[k: string\]: \(string \| \[string\]\|\[string, string\]\) \| undefined\n\s+\}\)\n(\}\])/g,
	`$1${validTitleMatchType}\n$2`,
);

dts += `
// Names of all the configs
export type ConfigNames = ${configNames.map((name) => `'${name}'`).join(" | ")}
`;

await fs.writeFile("src/typegen.d.ts", dts);
