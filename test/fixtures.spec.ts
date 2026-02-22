import type { OptionsConfig } from "@isentinel/eslint-config";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { FIXTURES_TEMP, runFixtureLint } from "./helpers";

const isWindows = os.platform() === "win32";
const timeout = isWindows ? 300_000 : 120_000;

interface FixtureConfig {
	name: string;
	options: Partial<OptionsConfig>;
}

const configs: Array<FixtureConfig> = [
	{
		name: "roblox-game",
		options: { roblox: true, type: "game" },
	},
	{
		name: "package",
		options: { roblox: false, type: "package" },
	},
	{
		name: "no-style",
		options: { formatters: false, roblox: true, stylistic: false },
	},
];

describe.for(configs)("$name", (config: FixtureConfig) => {
	it(
		"should produce expected lint output",
		async ({ expect }) => {
			expect.hasAssertions();

			const results = await runFixtureLint(config.name, config.options);

			for (const [file, content] of results) {
				const snapshotPath = path.resolve(
					import.meta.dirname,
					"../fixtures/output",
					config.name,
					file,
				);

				await expect.soft(content).toMatchFileSnapshot(snapshotPath);
			}

			await fs.rm(path.resolve(FIXTURES_TEMP, config.name), {
				force: true,
				recursive: true,
			});
		},
		timeout,
	);
});
