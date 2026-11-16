import { describe, it } from "vitest";

import { packageJson } from "../src/eslint/configs/package-json.ts";
import type { OptionsPackageJson } from "../src/eslint/types.ts";

const RULE_ID = "package-json/prefer-scoped-name";

/**
 * The `prefer-scoped-name` entry the package-json config emits.
 *
 * @param options - The package-json options to compose.
 * @returns The rule entry, or `undefined` when the rule is not set.
 */
async function findRule(options: OptionsPackageJson): Promise<unknown> {
	const configs = await packageJson(options);

	return configs.find((config) => config.name === "isentinel/package-json")?.rules?.[RULE_ID];
}

describe("packageJson scope", () => {
	it("leaves the rule off by default", async ({ expect }) => {
		expect.assertions(1);

		await expect(findRule({})).resolves.toBeUndefined();
	});

	it("passes scope as the preferred scope", async ({ expect }) => {
		expect.assertions(1);

		await expect(findRule({ scope: "@isentinel" })).resolves.toStrictEqual([
			"error",
			{ preferred: "@isentinel" },
		]);
	});

	it("passes allowedScopes alone", async ({ expect }) => {
		expect.assertions(1);

		await expect(findRule({ allowedScopes: ["@partner"] })).resolves.toStrictEqual([
			"error",
			{ allowed: ["@partner"] },
		]);
	});

	it("passes both options together", async ({ expect }) => {
		expect.assertions(1);

		await expect(
			findRule({ allowedScopes: ["@partner"], scope: "@isentinel" }),
		).resolves.toStrictEqual(["error", { allowed: ["@partner"], preferred: "@isentinel" }]);
	});
});
