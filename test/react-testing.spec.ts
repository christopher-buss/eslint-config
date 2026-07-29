import { describe, expect, it } from "vitest";

import { react } from "../src/eslint/configs/react.ts";
import { isRecord } from "../src/guards.ts";
import { oxlintReact } from "../src/oxlint/configs/react.ts";
import { reactRules, restrictedDomImportRule } from "../src/rules/react.ts";

const DOM_PACKAGE = "@packages/dom-testing-library-lua";

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

function settingValue(settings: unknown, name: string): unknown {
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
