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

	it("should match scoped roblox config", async () => {
		expect.hasAssertions();

		const configs = await isentinel({
			name: "test/scoped-roblox",
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			pnpm: false,
			roblox: { files: ["src/**"], filesTypeAware: ["src/**"] },
			spellCheck: false,
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

	it("should scope roblox rules and apply node rules to the complement", async () => {
		expect.hasAssertions();

		const configs = [
			...(await isentinel({
				name: "test/scoped-roblox",
				gitignore: false,
				isAgent: false,
				isInEditor: false,
				pnpm: false,
				roblox: { files: ["src/**"] },
				spellCheck: false,
			})),
		];

		// Roblox plugin rules bind only to the scoped files.
		const robloxConfig = configs.find((config) => config.name === "isentinel/roblox");

		expect(robloxConfig?.files).toStrictEqual(["src/**"]);

		// The complement (everything outside src/**) gets node rules.
		const nodeConfig = configs.find((config) => config.name === "isentinel/node/rules");

		expect(nodeConfig).toBeDefined();
		expect(nodeConfig?.ignores).toStrictEqual(["src/**"]);

		// The complement gets the non-roblox unicorn rules; the roblox base does
		// not.
		const complementUnicorn = configs.find(
			(config) => config.name === "isentinel/unicorn/complement",
		);

		expect(complementUnicorn?.ignores).toStrictEqual(["src/**"]);
		expect(complementUnicorn?.rules).toHaveProperty("unicorn/no-accidental-bitwise-operator");

		const baseUnicorn = findUnicornRules(configs);

		expect(baseUnicorn).not.toHaveProperty("unicorn/no-accidental-bitwise-operator");

		// `checkThenables` is roblox-only, so the complement turns it back off.
		const baseTypeAware = configs.find(
			(config) => config.name === "isentinel/typescript/rules-type-aware",
		);
		const complementTypeAware = configs.find(
			(config) => config.name === "isentinel/typescript/rules-type-aware/complement",
		);

		expect(baseTypeAware?.rules?.["ts/no-floating-promises"]).toStrictEqual([
			"error",
			{ checkThenables: true, ignoreVoid: true },
		]);
		expect(complementTypeAware?.ignores).toContain("src/**");
		expect(complementTypeAware?.rules?.["ts/no-floating-promises"]).toStrictEqual([
			"error",
			{ checkThenables: false, ignoreVoid: true },
		]);
	});

	it("should not add node rules to the default roblox config", async () => {
		expect.hasAssertions();

		const configs = [
			...(await isentinel({
				name: "test/default-roblox",
				gitignore: false,
				isAgent: false,
				isInEditor: false,
				pnpm: false,
				spellCheck: false,
			})),
		];

		expect(configs.find((config) => config.name === "isentinel/node/rules")).toBeUndefined();
	});

	it("should prepend naming selectors before the defaults", async () => {
		expect.hasAssertions();

		const variableSelector = { format: ["snake_case" as const], selector: "variable" as const };
		const functionSelector = {
			format: ["StrictPascalCase" as const],
			selector: "function" as const,
		};

		const configs = [
			...(await isentinel({
				name: "test/naming-selectors",
				gitignore: false,
				isAgent: false,
				isInEditor: false,
				naming: { selectors: [variableSelector], selectorsTsx: [functionSelector] },
				pnpm: false,
				spellCheck: false,
			})),
		];

		function findNamingRule(name: string): Array<unknown> | undefined {
			return configs.find((config) => config.name === name)?.rules?.[
				"flawless/naming-convention"
			] as Array<unknown> | undefined;
		}

		const tsRule = findNamingRule("isentinel/naming/ts/rules-type-aware");
		const tsxRule = findNamingRule("isentinel/naming/tsx/rules-type-aware");

		expect(tsRule?.[1]).toStrictEqual(variableSelector);
		expect(tsxRule?.[1]).toStrictEqual(functionSelector);
		expect(tsxRule?.[2]).toStrictEqual(variableSelector);
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
