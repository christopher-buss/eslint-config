import { findUpSync } from "find-up-simple";
import type { DummyRuleMap, ExternalPluginEntry, OxlintConfig, OxlintOverride } from "oxlint";
import { defineConfig } from "oxlint";
import type { Except } from "type-fest";

import { GLOB_ROOT } from "../globs.ts";
import type { OxlintSettings, TypedOxlintConfigItem } from "../types.ts";
import {
	getOverrides,
	isInAgentSession,
	isInEditorEnvironment,
	mergeGlobs,
	resolveOxfmtConfigOptionsSync,
	resolveSubOptions,
} from "../utils.ts";
import { oxlintCeaseNonsense } from "./configs/cease-nonsense.ts";
import { oxlintComments } from "./configs/comments.ts";
import { oxlintDisables } from "./configs/disables.ts";
import { eslintPlugin } from "./configs/eslint-plugin.ts";
import { gitignore } from "./configs/gitignore.ts";
import { oxlintImports } from "./configs/imports.ts";
import { oxlintJavascript } from "./configs/javascript.ts";
import { oxlintJsdoc } from "./configs/jsdoc.ts";
import { oxlintNode } from "./configs/node.ts";
import { oxfmt } from "./configs/oxfmt.ts";
import { oxlintPnpm } from "./configs/pnpm.ts";
import { oxlintPromise } from "./configs/promise.ts";
import { oxlintReact } from "./configs/react.ts";
import { roblox } from "./configs/roblox.ts";
import { oxlintSonarjs } from "./configs/sonarjs.ts";
import { oxlintSpelling } from "./configs/spelling.ts";
import { oxlintStylistic } from "./configs/stylistic.ts";
import { oxlintTest } from "./configs/test.ts";
import { oxlintTypescript } from "./configs/typescript.ts";
import { oxlintUnicorn } from "./configs/unicorn.ts";
import { oxlintDefaultRules } from "./oxlint.generated.ts";
import type { OxlintOptionsConfig, OxlintPlugin } from "./types.ts";

export type { OxlintOptions, OxlintOverride } from "./types.ts";

export function isentinel(
	options: Omit<TypedOxlintConfigItem, "files"> & OxlintOptionsConfig,
	...userConfigs: Array<TypedOxlintConfigItem>
): OxlintConfig {
	const {
		componentExts: componentExtensions = [],
		eslintPlugin: enableEslintPlugin = false,
		formatters,
		gitignore: enableGitignore = true,
		jsdoc: enableJsdoc,
		jsx: enableJsx = true,
		pnpm: enablePnpm = findUpSync("pnpm-workspace.yaml") !== undefined,
		react: enableReact = false,
		roblox: robloxOptions,
		root: customRootGlobs,
		rules = {},
		spellCheck: enableSpellCheck,
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
			...getOverrides(options, "javascript"),
			isInEditor,
			roblox: enableRoblox,
			stylistic: stylisticOptions,
		}),
		oxlintPromise(),
		oxlintSonarjs({ isInEditor }),
		oxlintTypescript({
			// ...resolveSubOptions(options, "typescript"),
			// ...getOverrides(options, "typescript"),
			componentExts: componentExtensions,
			stylistic: stylisticOptions,
		}),
		oxlintUnicorn({ root: rootGlobs, stylistic: stylisticOptions }),
	);

	if (enableJsdoc !== false) {
		configs.push(oxlintJsdoc({ stylistic: stylisticOptions, type: projectType }));
	}

	if (enableRoblox) {
		configs.push(
			roblox({
				...getOverrides(options, "roblox"),
				stylistic: stylisticOptions,
			}),
		);
	}

	if (projectType === "package" && !enableRoblox) {
		configs.push(oxlintNode());
	}

	if (enablePnpm !== false) {
		const pnpmOptions = typeof enablePnpm === "object" ? enablePnpm : {};
		configs.push(
			oxlintPnpm({
				isInEditor,
				...pnpmOptions,
			}),
		);
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

	if (enableReact !== false) {
		const reactOptions = typeof enableReact === "object" ? enableReact : {};
		configs.push(
			oxlintReact({
				// ...getOverrides(options, "react"),
				stylistic: stylisticOptions,
				...reactOptions,
			}),
		);
	}

	if (stylisticOptions !== false) {
		const stylisticFormatterOptions = typeof formatters === "object" ? formatters : {};
		configs.push(oxlintStylistic(stylisticOptions, stylisticFormatterOptions));
	}

	if (enableSpellCheck !== false) {
		configs.push(
			oxlintSpelling({
				...resolveSubOptions(options, "spellCheck"),
				componentExts: componentExtensions,
				isInEditor,
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

	if (stylisticOptions !== false) {
		const formatterOptions = typeof formatters === "object" ? formatters : {};
		const oxfmtConfigOptions = formatters !== false ? resolveOxfmtConfigOptionsSync() : {};
		const prettierOptions = formatterOptions.prettierOptions ?? {};
		const prettierSettings: Record<string, unknown> = {
			arrowParens: "always",
			printWidth: 100,
			quoteProps: "consistent",
			semi: true,
			singleQuote: false,
			tabWidth: 4,
			trailingComma: "all",
			useTabs: true,
			...prettierOptions,
		};

		configs.push(
			oxfmt({
				componentExts: componentExtensions,
				formatters:
					formatters !== false
						? formatters
						: {
								css: false,
								graphql: false,
								html: false,
								json: false,
								markdown: false,
								yaml: false,
							},
				oxfmtConfigOptions,
				oxfmtOptions: formatterOptions.oxfmtOptions,
				prettierOptions: prettierSettings,
			}),
		);
	}

	// Merge fragments: no `files` → top-level rules, with `files` → override
	const plugins = new Set<OxlintPlugin>();
	const jsPlugins = new Map<string, ExternalPluginEntry>();
	const overrides: Array<Except<TypedOxlintConfigItem, "name">> = [];
	const mergedSettings: OxlintSettings = {};

	for (const configArray of configs) {
		for (const config of configArray) {
			for (const plugin of config.plugins ?? []) {
				plugins.add(plugin);
			}

			for (const jsPlugin of config.jsPlugins ?? []) {
				const key = typeof jsPlugin === "string" ? jsPlugin : jsPlugin.specifier;
				jsPlugins.set(key, jsPlugin);
			}

			// Strip settings from overrides and merge to top-level
			if (config.settings) {
				Object.assign(mergedSettings, config.settings);
				config.settings = undefined as never;
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

		if (userConfig.settings) {
			Object.assign(mergedSettings, userConfig.settings);
			userConfig.settings = undefined as never;
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
		settings: mergedSettings,
	});
}
