import type { DummyRuleMap, ExternalPluginEntry, OxlintConfig, OxlintOverride } from "oxlint";
import { defineConfig } from "oxlint";
import type { Except } from "type-fest";

import type { OptionsConfig } from "../eslint/types.ts";
import { GLOB_ROOT } from "../globs.ts";
import type { TypedOxlintConfigItem } from "../types.ts";
import { isInAgentSession, isInEditorEnvironment, mergeGlobs } from "../utils.ts";
import { oxlintCeaseNonsense } from "./configs/cease-nonsense.ts";
import { oxlintComments } from "./configs/comments.ts";
import { oxlintDisables } from "./configs/disables.ts";
import { eslintPlugin } from "./configs/eslint-plugin.ts";
import { gitignore } from "./configs/gitignore.ts";
import { oxlintImports } from "./configs/imports.ts";
import { oxlintJavascript } from "./configs/javascript.ts";
import { oxlintJsdoc } from "./configs/jsdoc.ts";
import { oxlintNode } from "./configs/node.ts";
import { oxlintPromise } from "./configs/promise.ts";
import { oxlintSonarjs } from "./configs/sonarjs.ts";
import { oxlintTest } from "./configs/test.ts";
import { oxlintTypescript } from "./configs/typescript.ts";
import { oxlintUnicorn } from "./configs/unicorn.ts";
import { oxlintDefaultRules } from "./defaults.generated.ts";
import type { OxlintPlugin } from "./types.ts";

export type { OxlintOptions, OxlintOverride } from "./types.ts";

export function isentinel(
	options: Omit<TypedOxlintConfigItem, "files"> & OptionsConfig,
	...userConfigs: Array<TypedOxlintConfigItem>
): OxlintConfig {
	const {
		eslintPlugin: enableEslintPlugin = false,
		gitignore: enableGitignore = true,
		jsdoc: enableJsdoc,
		jsx: enableJsx = true,
		roblox: robloxOptions,
		root: customRootGlobs,
		rules = {},
		stylistic,
		test: enableTest = false,
		// typescript: typescriptOptions,
	} = options;

	// Name is added for debugging purposes (such as for the eslint config
	// inspector), but is not currently a supported oxlint config property
	options.name = undefined as never;

	const rootGlobs = mergeGlobs(GLOB_ROOT, customRootGlobs);
	const enableRoblox = robloxOptions !== false;

	let { defaultSeverity, isInEditor } = options;
	if (defaultSeverity === undefined && isInAgentSession()) {
		// oxlint-disable-next-line sonar/no-dead-store -- TODO
		defaultSeverity = "error";
	}

	isInEditor ??= isInEditorEnvironment();

	const projectType = (() => {
		if (options.type === "app") {
			return "game";
		}

		if (options.type !== undefined) {
			return options.type;
		}

		return enableRoblox ? "game" : "package";
	})();

	const stylisticOptions = (() => {
		if (stylistic === false) {
			return false;
		}

		if (typeof stylistic === "object") {
			return stylistic;
		}

		return {};
	})();

	if (stylisticOptions !== false && !("jsx" in stylisticOptions)) {
		stylisticOptions.jsx = enableJsx;
	}

	const configs: Array<Array<TypedOxlintConfigItem>> = [];

	const ignorePatterns = enableGitignore !== false ? gitignore() : [];

	configs.push(
		oxlintImports({ stylistic: stylisticOptions, type: projectType }),
		oxlintJavascript({
			// ...getOverrides(options, "javascript"),
			isInEditor,
			roblox: enableRoblox,
			stylistic: stylisticOptions,
		}),
		oxlintPromise(),
		oxlintSonarjs({ isInEditor }),
		oxlintTypescript({
			// ...resolveSubOptions(options, "typescript"),
			// ...getOverrides(options, "typescript"),
			// componentExts: componentExtensions,
			stylistic: stylisticOptions,
		}),
		oxlintUnicorn({ root: rootGlobs, stylistic: stylisticOptions }),
	);

	if (enableJsdoc !== false) {
		configs.push(oxlintJsdoc({ stylistic: stylisticOptions, type: projectType }));
	}

	if (projectType === "package" && !enableRoblox) {
		configs.push(oxlintNode());
	}

	if (enableTest !== false) {
		const testOptions = typeof enableTest === "object" ? enableTest : {};
		configs.push(
			oxlintTest({
				// ...getOverrides(options, "test"),
				isInEditor,
				roblox: enableRoblox,
				type: projectType,
				...testOptions,
			}),
		);
	}

	if (enableEslintPlugin !== false) {
		configs.push(eslintPlugin());
	}

	configs.push(
		oxlintCeaseNonsense({ isInEditor, stylistic: stylisticOptions }),
		oxlintComments({ stylistic: stylisticOptions }),
		oxlintDisables({ root: rootGlobs }),
	);

	// Merge fragments: no `files` → top-level rules, with `files` → override
	const plugins = new Set<OxlintPlugin>();
	const jsPlugins = new Map<string, ExternalPluginEntry>();
	const overrides: Array<Except<TypedOxlintConfigItem, "name">> = [];

	for (const configArray of configs) {
		for (const config of configArray) {
			for (const plugin of config.plugins ?? []) {
				plugins.add(plugin);
			}

			for (const jsPlugin of config.jsPlugins ?? []) {
				const key = typeof jsPlugin === "string" ? jsPlugin : jsPlugin.specifier;
				jsPlugins.set(key, jsPlugin);
			}

			config.name = undefined as never;
			overrides.push(config);
		}
	}

	// Collect all rule keys from overrides + user configs to know which
	// defaults are explicitly configured
	const configuredRules = new Set<string>();
	for (const override of overrides) {
		for (const key of Object.keys(override.rules ?? {})) {
			configuredRules.add(key);
		}
	}

	for (const userConfig of userConfigs) {
		for (const key of Object.keys(userConfig.rules ?? {})) {
			configuredRules.add(key);
		}
	}

	for (const key of Object.keys(rules)) {
		configuredRules.add(key);
	}

	// Suppress oxlint default rules not explicitly configured.
	// Workaround for https://github.com/oxc-project/oxc/issues/19409 —
	// `categories: "off"` also suppresses rules inside overrides.
	const suppressedDefaults: DummyRuleMap = {};
	for (const rule of oxlintDefaultRules) {
		if (!configuredRules.has(rule)) {
			suppressedDefaults[rule] = "off";
		}
	}

	return defineConfig({
		categories: {
			correctness: "off",
			nursery: "off",
			pedantic: "off",
			perf: "off",
			restriction: "off",
			style: "off",
			suspicious: "off",
		},
		ignorePatterns,
		jsPlugins: [...jsPlugins.values()],
		overrides: [
			...overrides,
			...userConfigs.map((config) => ({ ...config, name: undefined })),
		] as Array<OxlintOverride>,
		plugins: [...plugins],
		rules: { ...suppressedDefaults, ...rules } as DummyRuleMap,
	});
}
