import type { Rule } from "eslint";
import { Linter } from "eslint";
import { describe, it } from "vitest";

import { oxfmtSingleFix } from "../src/eslint/oxfmt-single-fix.ts";

/** Reports two separate hunks, as eslint-plugin-oxfmt does. */
const twoHunks: Rule.RuleModule = {
	create(context) {
		return {
			Program() {
				context.report({
					fix: (fixer) => fixer.replaceTextRange([0, 1], "A"),
					loc: { column: 0, line: 1 },
					message: "first",
				});
				context.report({
					fix: (fixer) => fixer.replaceTextRange([4, 5], "B"),
					loc: { column: 4, line: 1 },
					message: "second",
				});
			},
		};
	},
	meta: { fixable: "code", schema: [], type: "layout" },
};

function lint(code: string): Array<Linter.LintMessage> {
	const plugin = oxfmtSingleFix({ rules: { oxfmt: twoHunks } });
	const linter = new Linter();
	return linter.verify(code, [{ plugins: { oxfmt: plugin }, rules: { "oxfmt/oxfmt": "error" } }]);
}

describe("oxfmtSingleFix", () => {
	it("keeps every message but merges the fixes into one", ({ expect }) => {
		expect.assertions(3);

		const messages = lint("a = b;");

		expect(messages.map(({ message }) => message)).toStrictEqual(["first", "second"]);
		expect(messages[0]!.fix).toStrictEqual({ range: [0, 5], text: "A = B" });
		expect(messages[1]!.fix).toBeUndefined();
	});

	it("applies the merged fix whole", ({ expect }) => {
		expect.assertions(1);

		const plugin = oxfmtSingleFix({ rules: { oxfmt: twoHunks } });
		const linter = new Linter();
		const { output } = linter.verifyAndFix("a = b;", [
			{ plugins: { oxfmt: plugin }, rules: { "oxfmt/oxfmt": "error" } },
		]);

		expect(output.startsWith("A = B")).toBe(true);
	});
});
