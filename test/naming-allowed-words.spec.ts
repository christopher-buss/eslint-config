import tsParser from "@typescript-eslint/parser";

import { ESLint } from "eslint";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { naming } from "../src/eslint/configs/naming.ts";
import type { NamingConfig, TypedFlatConfigItem } from "../src/eslint/types.ts";
import { ROBLOX_ALLOWED_WORDS } from "../src/generated/roblox-allowed-words.ts";

interface FlawlessSettings {
	namingConvention?: { allowedWords?: ReadonlyArray<string> };
}

const RULE_ID = "flawless/naming-convention";
const SETUP = "isentinel/naming/setup";

/**
 * A file inside the project, so ESLint does not treat the snippet as external.
 */
const VIRTUAL_FILE = path.join(import.meta.dirname, "allowed-words.ts");

/**
 * Whether a `settings.flawless` value is shaped like the rule's own settings.
 *
 * @param value - The raw setting.
 * @returns True when the value is an object.
 */
function isFlawlessSettings(value: unknown): value is FlawlessSettings {
	return typeof value === "object" && value !== null;
}

/**
 * The words the naming config puts on shared settings, which every selector
 * inherits.
 *
 * @param configs - The resolved naming configs.
 * @returns The configured words, or `undefined` when the setting is absent.
 */
function findAllowedWords(configs: Array<TypedFlatConfigItem>): ReadonlyArray<string> | undefined {
	const settings = configs.find((config) => config.name === SETUP)?.settings;
	const flawlessSettings = settings?.["flawless"];
	if (!isFlawlessSettings(flawlessSettings)) {
		return undefined;
	}

	return flawlessSettings.namingConvention?.allowedWords;
}

/**
 * Lints a snippet of `strictCamelCase` variables against the naming config's
 * own setup item, so the shared settings under test are the ones the preset
 * actually emits.
 *
 * @param code - The source to lint.
 * @param options - The naming options to compose.
 * @returns The names the rule rejected.
 */
async function lint(code: string, options: NamingConfig): Promise<Array<string>> {
	const composed = await naming(options);
	const setup = composed.find((config) => config.name === SETUP);
	const configs: Array<TypedFlatConfigItem> = [
		...(setup ? [setup] : []),
		{
			files: ["**/*.ts"],
			languageOptions: { parser: tsParser },
			rules: {
				[RULE_ID]: ["error", { format: ["strictCamelCase"], selector: "variable" }],
			},
		},
	];

	const eslint = new ESLint({
		overrideConfig: configs,
		overrideConfigFile: true,
		warnIgnored: false,
	});
	const results = await eslint.lintText(code, { filePath: VIRTUAL_FILE });

	return results
		.flatMap((result) => result.messages)
		.filter((message) => message.ruleId === RULE_ID)
		.map((message) => message.message);
}

describe("naming allowedWords", () => {
	it("emits no settings by default", async () => {
		expect.assertions(1);

		expect(findAllowedWords(await naming())).toBeUndefined();
	});

	it("uses the generated Roblox list when enabled", async () => {
		expect.assertions(1);

		expect(findAllowedWords(await naming({ allowedWords: true }))).toStrictEqual(
			ROBLOX_ALLOWED_WORDS,
		);
	});

	it("uses an explicit list verbatim", async () => {
		expect.assertions(1);

		expect(findAllowedWords(await naming({ allowedWords: ["CFrame", "MyAPI"] }))).toStrictEqual(
			["CFrame", "MyAPI"],
		);
	});

	it("treats an empty list as off", async () => {
		expect.assertions(1);

		// Otherwise the config would ship a setting that says nothing, and a
		// selector could no longer tell "inherited nothing" from "opted out".
		expect(findAllowedWords(await naming({ allowedWords: [] }))).toBeUndefined();
	});

	it("rejects a Roblox name by default", async () => {
		expect.assertions(1);

		await expect(lint("const targetCFrame = 1;", {})).resolves.toStrictEqual([
			expect.stringContaining("targetCFrame"),
		]);
	});

	it("accepts a Roblox name once enabled", async () => {
		expect.assertions(2);

		await expect(
			lint("const targetCFrame = 1;", { allowedWords: true }),
		).resolves.toStrictEqual([]);
		// `UDim` absorbs `UDim2`, so the pruned list still covers it.
		await expect(lint("const offsetUDim2 = 1;", { allowedWords: true })).resolves.toStrictEqual(
			[],
		);
	});

	it("still checks the rest of the name", async () => {
		expect.assertions(2);

		await expect(
			lint("const target_CFrame = 1;", { allowedWords: true }),
		).resolves.toStrictEqual([expect.stringContaining("target_CFrame")]);
		// A word only matches at a hump boundary, so it cannot split a hump.
		await expect(
			lint("const targetXCFrame = 1;", { allowedWords: true }),
		).resolves.toStrictEqual([expect.stringContaining("targetXCFrame")]);
	});
});
