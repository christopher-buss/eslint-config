import { describe, it } from "vitest";

import { splitOxlintRules } from "../src/oxlint/utils.ts";
import type { Rules } from "../src/types.ts";

const TS_EXTENSION_PAIRS = [
	"default-param-last",
	"no-empty-function",
	"no-shadow",
	"no-unused-expressions",
	"no-unused-private-class-members",
	"no-useless-constructor",
	"prefer-destructuring",
];

function buildRules(order: Array<string>, extension: string): Rules {
	const rules: Rules = {};
	for (const rule of order) {
		rules[rule] = rule === extension ? "error" : "off";
	}

	return rules;
}

describe("splitOxlintRules ts-extension precedence", () => {
	it.for(TS_EXTENSION_PAIRS)(
		"should let the ts extension of %s win over its core rule regardless of order",
		(core, { expect }) => {
			expect.hasAssertions();

			const extension = `ts/${core}`;
			const coreFirst = splitOxlintRules(buildRules([core, extension], extension));
			const extensionFirst = splitOxlintRules(buildRules([extension, core], extension));

			expect(coreFirst.nativeRules[core]).toBe("error");
			expect(extensionFirst.nativeRules[core]).toBe("error");
		},
	);
});
