import { describe, expect, it } from "vitest";

import { stylisticRuleNames } from "../src/rules/stylistic-generated.ts";
import { interopDefault } from "../src/utils.ts";

describe("stylistic rule-name snapshot", () => {
	it("matches the installed @stylistic/eslint-plugin", async () => {
		expect.assertions(1);

		const plugin = await interopDefault(import("@stylistic/eslint-plugin"));

		// The oxlint factory reads the snapshot instead of loading the plugin, so
		// a plugin bump that adds or removes rules must be followed by `pnpm gen`
		// or `style/*` disables would be dropped (or sent to oxlint unknown).
		expect([...stylisticRuleNames].sort()).toStrictEqual(Object.keys(plugin.rules).sort());
	});
});
