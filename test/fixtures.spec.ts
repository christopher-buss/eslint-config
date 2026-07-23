import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, onTestFinished } from "vitest";

import { FIXTURES_TEMP, runFixtureLint } from "./helpers.ts";
import type { FixtureOptions } from "./helpers.ts";

const isWindows = os.platform() === "win32";
const timeout = isWindows ? 300_000 : 120_000;

interface FixtureConfig {
	name: string;
	options: FixtureOptions;
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
			// The input fixtures are a fixed set of 11 files, so this is 11
			// soft assertions from the loop plus the trailing size check.
			expect.assertions(12);

			onTestFinished(async () => {
				await fs.rm(path.resolve(FIXTURES_TEMP, config.name), {
					force: true,
					recursive: true,
				});
			});

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

			expect(results.size).toBe(11);
		},
		timeout,
	);
});
