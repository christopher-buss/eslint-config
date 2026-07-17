import { describe, expect, it } from "vitest";

import { isentinel } from "../src";
import { serializeConfigs } from "./helpers";

function findUnicornRules(
	configs: Array<{ name?: string; rules?: Record<string, unknown> }>,
): Record<string, unknown> | undefined {
	return configs.find((config) => config.name === "isentinel/unicorn/rules")?.rules;
}

describe("config snapshots", () => {
	it("should match default roblox game config", async () => {
		expect.hasAssertions();

		const configs = await isentinel({
			name: "test/roblox-game",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			pnpm: false,
			spellCheck: false,
		});

		expect(serializeConfigs([...configs])).toMatchSnapshot();
	});

	it("should match package mode config", async () => {
		expect.hasAssertions();

		const configs = await isentinel({
			name: "test/package",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			pnpm: false,
			roblox: false,
			spellCheck: false,
			type: "package",
		});

		expect(serializeConfigs([...configs])).toMatchSnapshot();
	});

	it("should enable non-roblox unicorn rules for package configs", async () => {
		expect.hasAssertions();

		const packageConfigs = await isentinel({
			name: "test/package-unicorn",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			pnpm: false,
			roblox: false,
			spellCheck: false,
			type: "package",
		});
		const packageRules = findUnicornRules([...packageConfigs]);

		expect(packageRules).toBeDefined();
		expect(packageRules).toHaveProperty("unicorn/no-accidental-bitwise-operator");

		const gameConfigs = await isentinel({
			name: "test/game-unicorn",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			pnpm: false,
			spellCheck: false,
		});
		const gameRules = findUnicornRules([...gameConfigs]);

		expect(gameRules).toBeDefined();
		expect(gameRules).not.toHaveProperty("unicorn/no-accidental-bitwise-operator");
	});

	it("should match minimal config", async () => {
		expect.hasAssertions();

		const configs = await isentinel({
			name: "test/minimal",
			formatters: false,
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			pnpm: false,
			spellCheck: false,
			stylistic: false,
		});

		expect(serializeConfigs([...configs])).toMatchSnapshot();
	});
});
