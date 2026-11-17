import { ESLint } from "eslint";
import { describe, it } from "vitest";

import { node } from "../src/eslint/configs/node.ts";

describe("node config", () => {
	// `nodeRules` includes unicorn rules, so the config has to register the
	// unicorn plugin itself: ESLint rejects a rule whose plugin is missing
	// before it lints anything.
	it("lints on its own, without the unicorn config", async ({ expect }) => {
		expect.assertions(1);

		const eslint = new ESLint({
			overrideConfig: await node({ files: ["**/*.js"] }),
			overrideConfigFile: true,
		});

		const [result] = await eslint.lintText("export const value = 1;\n", {
			filePath: "source.js",
		});

		expect(result!.messages).toStrictEqual([]);
	});
});
