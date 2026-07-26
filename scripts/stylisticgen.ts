import fs from "node:fs/promises";

import { interopDefault } from "../src/utils.ts";

/**
 * Snapshot `@stylistic/eslint-plugin`'s rule names at build time.
 *
 * The oxlint factory only needs the names — it checks whether a `style/*`
 * disable exists before handing it to oxlint — but loading the plugin to read
 * them pulls in all 97 rule implementations (and espree, acorn, acorn-jsx,
 * estraverse with them): ~78ms on every oxlint run, even in native-only mode
 * where no `style/*` rule can execute. The plugin is a pinned direct
 * dependency, so the names are the same for every consumer and a snapshot
 * costs nothing at runtime. `stylistic-rule-names.spec.ts` fails when the
 * snapshot drifts from the installed plugin.
 */

const plugin = await interopDefault(import("@stylistic/eslint-plugin"));
const names = Object.keys(plugin.rules).sort();

await fs.writeFile(
	new URL("../src/rules/stylistic-generated.ts", import.meta.url),
	`export const stylisticRuleNames: ReadonlySet<string> = new Set(${JSON.stringify(names, null, 2)});\n`,
);
