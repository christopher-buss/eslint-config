import { flatConfigsToRulesDTS } from "eslint-typegen/core";
import { builtinRules } from "eslint/use-at-your-own-risk";
import fs from "node:fs/promises";

import {
	comments,
	e18e,
	eslintPlugin,
	flawless,
	gitignore,
	ignores,
	imports,
	javascript,
	jsdoc,
	jsonc,
	markdown,
	naming,
	node,
	oxfmt,
	packageJson,
	perfectionist,
	pnpm,
	promise,
	react,
	roblox,
	smallRules,
	sonarjs,
	spelling,
	stylistic,
	test,
	toml,
	typescript,
	unicorn,
	yaml,
} from "../src/index.ts";
import { combine } from "../src/utils.ts";

const configs = await combine(
	{
		plugins: {
			"": {
				// oxlint-disable-next-line typescript/no-deprecated -- No non-deprecated API exposes the built-in rule map.
				rules: Object.fromEntries(builtinRules),
			},
		},
	},
	comments(),
	e18e(),
	eslintPlugin(),
	flawless(),
	gitignore(),
	ignores(),
	imports(),
	javascript(),
	jsdoc(),
	jsonc(),
	markdown(),
	naming(),
	node(),
	oxfmt(),
	packageJson(),
	perfectionist(),
	pnpm({ isInEditor: false }),
	promise(),
	react(),
	roblox(),
	smallRules(),
	sonarjs({ isInEditor: false }),
	spelling(),
	stylistic(),
	test({ jest: true, vitest: true }),
	toml(),
	typescript({ erasableOnly: true }),
	unicorn(),
	yaml(),
);

const configNames = configs
	.map((config) => config.name)
	.filter((name): name is string => Boolean(name));

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
	/(\n\/\/ ----- (?:jest|vitest)\/valid-title -----\ntype \w+ValidTitle = \[\]\|\[\{[^}]*?)\[k: string\]: \(string \| \[string\]\|\[string, string\] \| \{\n\s+\[k: string\]: \(string \| \[string\]\|\[string, string\]\) \| undefined\n\s+\}\)\n(\}\])/g,
	// eslint-disable-next-line unicorn/no-unsafe-string-replacement -- `validTitleMatchType` is a static constant with no `$` sequences; `$1`/`$2` are intentional capture references.
	`$1${validTitleMatchType}\n$2`,
);

dts += `
// Names of all the configs
export type ConfigNames = ${configNames.map((name) => `'${name}'`).join(" | ")}
`;

await fs.writeFile("src/typegen.d.ts", dts);
