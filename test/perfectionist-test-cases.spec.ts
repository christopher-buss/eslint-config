import { Linter } from "eslint";
import pluginPerfectionist from "eslint-plugin-perfectionist";
import { describe, expect, it } from "vitest";

import { eslintPluginRules } from "../src/rules/eslint-plugin.ts";
import { perfectionistRules, perfectionistSettings } from "../src/rules/perfectionist.ts";

const config: Linter.Config = {
	plugins: { perfectionist: pluginPerfectionist },
	rules: {
		"perfectionist/sort-objects":
			perfectionistRules()?.["perfectionist/sort-objects"] ?? "error",
	},
	settings: { ...perfectionistSettings },
};

/**
 * Fix a snippet with the shipped `sort-objects` configuration.
 *
 * The snippets are single-line so the assertions compare property order without
 * depending on how the fixer lays out multiline objects.
 *
 * @param source - The snippet to fix.
 * @returns The fixed source, and any message the fixer could not resolve.
 */
function fix(source: string): { messages: Array<string>; output: string } {
	const linter = new Linter();
	const result = linter.verifyAndFix(source, config, "rule.test.js");
	return {
		messages: result.messages.map((message) => message.message),
		output: result.output,
	};
}

describe("rule-test case sorting", () => {
	it("orders inline test cases like eslint-plugin expects", () => {
		expect.assertions(2);

		const { messages, output } = fix(
			'ruleTester.run("no-x", rule, { valid: [], invalid: [{ errors: [{ messageId: "m", column: 1 }], code: "spawn(1);", name: "n", only: false }] });',
		);

		// `name` first, then the `test-case-property-ordering` canon, then keys
		// that rule does not list (`only`). The nested `errors` object is not a
		// test case, so it stays alphabetical.
		expect(output).toBe(
			'ruleTester.run("no-x", rule, { invalid: [{ name: "n", code: "spawn(1);", errors: [{ column: 1, messageId: "m" }], only: false }], valid: [] });',
		);
		expect(messages).toStrictEqual([]);
	});

	it("orders test cases extracted to a variable", () => {
		expect.assertions(2);

		const { messages, output } = fix(
			'const invalidCases = [{ errors: [{ messageId: "m", column: 1 }], code: "spawn(1);", name: "n" }];',
		);

		expect(output).toBe(
			'const invalidCases = [{ name: "n", code: "spawn(1);", errors: [{ column: 1, messageId: "m" }] }];',
		);
		expect(messages).toStrictEqual([]);
	});

	it("leaves objects outside a test case alphabetical", () => {
		expect.assertions(2);

		const { messages, output } = fix('const other = { zebra: 1, apple: 2, code: "c" };');

		// `code` is a test-case key, but this object is neither in a
		// `valid`/`invalid` array nor in a case declaration.
		expect(output).toBe('const other = { apple: 2, code: "c", zebra: 1 };');
		expect(messages).toStrictEqual([]);
	});

	it("leaves test-case ordering to perfectionist alone", () => {
		expect.assertions(1);

		// Both rules order the same objects, and their orders disagree, so every
		// case needed a `perfectionist/sort-objects` disable comment. The plugin
		// rule is also the worse fixer of the two: on a case with keys outside
		// its order it duplicates one property and drops another
		// (eslint-plugin-eslint-plugin 7.5.0).
		expect(eslintPluginRules()).toMatchObject({
			"eslint-plugin/test-case-property-ordering": "off",
		});
	});
});
