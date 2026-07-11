import { describe, expect, it } from "vitest";

import { isentinel } from "../src";
import { serializeConfigs } from "./helpers";

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
