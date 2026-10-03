import { ESLint } from "eslint";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { OptionsConfig, TypedFlatConfigItem } from "../src/eslint/types.ts";
import { isentinel } from "../src/index.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

const DEAD_HEADER = "oxlint owns in hybrid mode";

const baseOptions = {
	formatters: true,
	gitignore: false,
	isAgent: false,
	isInEditor: false,
	pnpm: false,
	roblox: false,
	spellCheck: false,
} as const;

/**
 * Every oxfmt config scoped to a language oxlint cannot parse. Oxlint reads
 * only the JS/TS family, so these must keep formatting in ESLint even in
 * hybrid mode.
 */
const NON_JS_FORMATTER_CONFIGS = [
	"isentinel/oxfmt/css",
	"isentinel/oxfmt/scss",
	"isentinel/oxfmt/less",
	"isentinel/oxfmt/html",
	"isentinel/oxfmt/markdown",
	"isentinel/oxfmt/graphql",
	"isentinel/oxfmt/json",
	"isentinel/oxfmt/yaml",
] as const;

type FactoryOptions = OptionsConfig & TypedFlatConfigItem & { namedConfigs?: false };

async function resolveConfigs(
	options: Record<string, unknown>,
	...userConfigs: Array<TypedFlatConfigItem>
): Promise<Array<TypedFlatConfigItem>> {
	const composer = await isentinel(options as FactoryOptions, ...userConfigs);
	return [...composer];
}

/**
 * The `name` of every config, with unnamed ones collapsed to an empty string.
 *
 * @param configs - The resolved flat config items.
 * @returns One entry per config, in resolution order.
 */
function configNames(configs: Array<TypedFlatConfigItem>): Array<string> {
	return configs.map((config) => config.name ?? "");
}

/**
 * The names of the configs that enable `oxfmt/oxfmt`, in resolution order.
 *
 * @param configs - The resolved flat config items.
 * @returns The names of the configs that format.
 */
function formattingConfigNames(configs: Array<TypedFlatConfigItem>): Array<string> {
	return configNames(configs.filter((config) => config.rules?.["oxfmt/oxfmt"] !== undefined));
}

describe("oxlint hybrid formatter coverage", () => {
	it("should keep oxfmt in ESLint for languages oxlint cannot parse", async () => {
		expect.assertions(1);

		const configs = await resolveConfigs({ ...baseOptions, oxlint: true });
		const formatting = new Set(formattingConfigNames(configs));

		expect([...NON_JS_FORMATTER_CONFIGS].filter((name) => !formatting.has(name))).toStrictEqual(
			[],
		);
	});

	it("should not create unreachable Markdown siblings for those configs", async () => {
		expect.assertions(1);

		const configs = await resolveConfigs({ ...baseOptions, oxlint: true });
		const names = new Set(configNames(configs));

		expect(
			NON_JS_FORMATTER_CONFIGS.map((name) => `${name}/markdown-code`).filter((name) => {
				return names.has(name);
			}),
		).toStrictEqual([]);
	});

	it("should still hand JS/TS formatting to oxlint", async () => {
		expect.assertions(1);

		const configs = await resolveConfigs({ ...baseOptions, oxlint: true });

		expect(formattingConfigNames(configs)).toStrictEqual([
			"isentinel/oxfmt/markdown-code",
			...NON_JS_FORMATTER_CONFIGS,
		]);
	});

	it("should report formatting on a YAML file in hybrid mode", async () => {
		expect.assertions(1);

		const configs = await resolveConfigs({ ...baseOptions, ignores: [], oxlint: true });
		const eslint = new ESLint({
			cwd: PROJECT_ROOT,
			overrideConfig: configs,
			overrideConfigFile: true,
		});

		const results = await eslint.lintText("a:    1\nb:      [1,    2]\n", {
			filePath: path.join(PROJECT_ROOT, "hybrid-formatter-coverage.yaml"),
		});

		expect(
			results.flatMap((result) => result.messages.map((message) => message.ruleId)),
		).toContain("oxfmt/oxfmt");
	});

	it("should not warn that oxfmt is dead in a non-JS user config", async () => {
		expect.assertions(1);

		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		let messages: Array<string> = [];
		try {
			await resolveConfigs(
				{ ...baseOptions, oxlint: true },
				{
					name: "user/yaml-format",
					files: ["**/*.y{,a}ml"],
					rules: { "oxfmt/oxfmt": "error" },
				},
			);
			messages = warn.mock.calls.map((call) => String(call[0]));
		} finally {
			warn.mockRestore();
		}

		expect(messages.filter((message) => message.includes(DEAD_HEADER))).toStrictEqual([]);
	});
});
