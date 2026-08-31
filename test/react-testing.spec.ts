import { describe, expect, it } from "vitest";

import { react } from "../src/eslint/configs/react.ts";
import type { JsonValue } from "../src/guards.ts";
import { isRecord } from "../src/guards.ts";
import { isentinel } from "../src/index.ts";
import { oxlintReact } from "../src/oxlint/configs/react.ts";
import { isentinel as oxlintIsentinel } from "../src/oxlint/index.ts";
import {
	mergeRestrictedDomImportRule,
	reactRules,
	restrictedDomImportRule,
} from "../src/rules/react.ts";
import type { TypedFlatConfigItem } from "../src/types.ts";

const DOM_PACKAGE = "@packages/dom-testing-library-lua";
const PROJECT_PACKAGE = "@packages/server-only";
type RestrictedImportRule = NonNullable<
	NonNullable<TypedFlatConfigItem["rules"]>["no-restricted-imports"]
>;
const PROJECT_RESTRICTION = {
	name: PROJECT_PACKAGE,
	message: "This package is server-only.",
};

function testingLibraryRules(rules: unknown) {
	if (!isRecord(rules)) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(rules).filter(([name]) => name.startsWith("testing-library/")),
	);
}

const SHARED_TESTING_LIBRARY_RULES = testingLibraryRules(reactRules({ testing: true }));
const RESTRICTED_DOM_IMPORT = restrictedDomImportRule(DOM_PACKAGE);
const COMPOSED_RESTRICTED_IMPORTS = [
	"warn",
	{
		paths: [
			PROJECT_RESTRICTION,
			{
				name: DOM_PACKAGE,
				message:
					"Import from react-testing-library-lua instead; it re-exports the DOM utilities, and eslint-plugin-testing-library only detects one module per file.",
			},
		],
		patterns: ["@internal/*"],
	},
];

type EslintRestrictedImports = NonNullable<TypedFlatConfigItem["rules"]>["no-restricted-imports"];

type OxlintRestrictedImports = NonNullable<
	ReturnType<typeof oxlintIsentinel>["rules"]
>["no-restricted-imports"];

async function getReactTestingConfig(testing: boolean) {
	const configs = await react({ stylistic: false, testing, typeAware: false });
	const reactRuleConfig = configs.find((config) => config.name === "isentinel/react/rules");
	if (reactRuleConfig === undefined) {
		throw new Error("React rules config was not generated");
	}

	const testingSetup = configs.find(
		(config) => config.name === "isentinel/react/setup/testing-library",
	);
	const configuredTestingRules = testingLibraryRules(reactRuleConfig.rules);

	return {
		configuredTestingRules,
		settings: reactRuleConfig.settings,
		testingPlugins: testingSetup?.plugins,
		testingSetup,
	};
}

async function getRestrictedDomImportRules() {
	const configs = await react({
		settings: {
			"testing-library": {
				domPackage: DOM_PACKAGE,
			},
		},
		stylistic: false,
		testing: true,
	});
	const reactRuleConfig = configs.find((config) => config.name === "isentinel/react/rules");
	if (reactRuleConfig?.rules === undefined) {
		throw new Error("React import restriction config was not generated");
	}

	return reactRuleConfig.rules["no-restricted-imports"];
}

function settingValue(settings: unknown, name: string): JsonValue | undefined {
	return isRecord(settings) ? settings[name] : undefined;
}

function getOxlintTestingConfig() {
	const configs = oxlintReact({
		settings: {
			"testing-library": {
				domPackage: DOM_PACKAGE,
			},
		},
		testing: true,
	});
	const testingConfig = configs.find((config) => {
		return config.rules?.["testing-library/await-async-queries"] === "error";
	});
	if (testingConfig?.rules === undefined) {
		throw new Error("Oxlint Testing Library config was not generated");
	}

	const configuredTestingRules = testingLibraryRules(testingConfig.rules);
	const restrictedDomImport = configs.find(
		(config) => config.rules?.["no-restricted-imports"] !== undefined,
	)?.rules?.["no-restricted-imports"];
	const utilsModule = configs
		.map((config) => settingValue(config.settings, "testing-library/utils-module"))
		.find((value) => value !== undefined);

	return {
		configuredTestingRules,
		restrictedDomImport,
		testingJsPlugins: testingConfig.jsPlugins as unknown,
		utilsModule,
	};
}

function getLastOxlintRestrictedImports(
	config: ReturnType<typeof oxlintIsentinel>,
): OxlintRestrictedImports {
	return [
		config.rules?.["no-restricted-imports"],
		...(config.overrides ?? []).map((override) => override.rules?.["no-restricted-imports"]),
	].findLast((rule) => rule !== undefined);
}

function findRestrictedImports(
	configs: Array<TypedFlatConfigItem>,
	name: string,
): EslintRestrictedImports {
	return configs.find((config) => config.name === name)?.rules?.["no-restricted-imports"];
}

describe("react testing-library support", () => {
	it("does not register testing-library by default", async () => {
		expect.assertions(3);

		const { configuredTestingRules, settings, testingSetup } =
			await getReactTestingConfig(false);

		expect(testingSetup).toBeUndefined();
		expect(configuredTestingRules).toStrictEqual({});
		expect(settings).not.toHaveProperty("testing-library/utils-module");
	});

	it("registers the plugin, rules, and Lua utilities setting when enabled", async () => {
		expect.assertions(3);

		const { configuredTestingRules, settings, testingPlugins } =
			await getReactTestingConfig(true);

		expect(testingPlugins).toHaveProperty("testing-library");
		expect(configuredTestingRules).toStrictEqual(SHARED_TESTING_LIBRARY_RULES);
		expect(settings).toHaveProperty("testing-library/utils-module", "testing-library-lua");
	});

	it("restricts direct DOM Testing Library imports", async () => {
		expect.assertions(1);

		const restrictedDomImport = await getRestrictedDomImportRules();

		expect(restrictedDomImport).toStrictEqual(RESTRICTED_DOM_IMPORT);
	});

	it("shares Testing Library rules with oxlint", () => {
		expect.assertions(4);

		const { configuredTestingRules, restrictedDomImport, testingJsPlugins, utilsModule } =
			getOxlintTestingConfig();

		expect(configuredTestingRules).toStrictEqual(SHARED_TESTING_LIBRARY_RULES);
		expect(restrictedDomImport).toStrictEqual(RESTRICTED_DOM_IMPORT);
		expect(testingJsPlugins).toStrictEqual(
			expect.arrayContaining([expect.objectContaining({ name: "testing-library" })]),
		);
		expect(utilsModule).toBe("testing-library-lua");
	});
});

describe("dom import restriction composition", () => {
	it("merges object-style restrictions without changing project policy", () => {
		expect.assertions(1);

		const merged = mergeRestrictedDomImportRule(
			[
				"warn",
				{
					paths: [PROJECT_RESTRICTION],
					patterns: ["@internal/*"],
				},
			],
			DOM_PACKAGE,
		);

		expect(merged).toStrictEqual(COMPOSED_RESTRICTED_IMPORTS);
	});

	it("supports legacy and severity-only entries", () => {
		expect.assertions(2);

		expect(mergeRestrictedDomImportRule(["error", PROJECT_PACKAGE], DOM_PACKAGE)).toStrictEqual(
			["error", PROJECT_PACKAGE, expect.objectContaining({ name: DOM_PACKAGE })],
		);
		expect(mergeRestrictedDomImportRule(1, DOM_PACKAGE)).toStrictEqual([
			1,
			{ paths: [expect.objectContaining({ name: DOM_PACKAGE })] },
		]);
	});

	it("preserves explicit disables and project-owned duplicates", () => {
		expect.assertions(3);

		const disabled: RestrictedImportRule = [0, { paths: [PROJECT_PACKAGE] }];
		const duplicate: RestrictedImportRule = [
			"warn",
			{
				paths: [{ name: DOM_PACKAGE, message: "Use the project wrapper." }],
			},
		];

		expect(mergeRestrictedDomImportRule("off", DOM_PACKAGE)).toBe("off");
		expect(mergeRestrictedDomImportRule(disabled, DOM_PACKAGE)).toBe(disabled);
		expect(mergeRestrictedDomImportRule(duplicate, DOM_PACKAGE)).toBe(duplicate);
	});

	it("composes top-level and appended ESLint rules", async () => {
		expect.assertions(2);

		const options = {
			name: "test/react-restrictions",
			formatters: false,
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			pnpm: false,
			react: { testing: true },
			settings: {
				"testing-library": {
					domPackage: DOM_PACKAGE,
				},
			},
			spellCheck: false,
			typeAware: false,
		} as const;
		const projectRule: RestrictedImportRule = [
			"warn",
			{ paths: [PROJECT_RESTRICTION], patterns: ["@internal/*"] },
		];
		const topLevel = await isentinel({
			...options,
			rules: { "no-restricted-imports": projectRule },
		});
		const appended = await isentinel(options, {
			name: "project/restrictions",
			rules: { "no-restricted-imports": projectRule },
		});

		expect(findRestrictedImports([...topLevel], options.name)).toStrictEqual(
			COMPOSED_RESTRICTED_IMPORTS,
		);
		expect(findRestrictedImports([...appended], "project/restrictions")).toStrictEqual(
			COMPOSED_RESTRICTED_IMPORTS,
		);
	});

	it("composes the native oxlint rule in native-only mode", () => {
		expect.assertions(1);

		const config = oxlintIsentinel({
			name: "test/react-restrictions",
			formatters: false,
			gitignore: false,
			isAgent: false,
			isInEditor: false,
			jsPlugins: false,
			react: { testing: true },
			roblox: false,
			rules: {
				"no-restricted-imports": [
					"warn",
					{ paths: [PROJECT_RESTRICTION], patterns: ["@internal/*"] },
				],
			},
			settings: {
				"testing-library": {
					domPackage: DOM_PACKAGE,
				},
			},
			spellCheck: false,
		});

		expect(getLastOxlintRestrictedImports(config)).toStrictEqual(COMPOSED_RESTRICTED_IMPORTS);
	});
});
