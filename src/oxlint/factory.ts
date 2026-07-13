import { isPackageExists } from "local-pkg";
import type { DummyRuleMap, ExternalPluginEntry, OxlintConfig, OxlintOverride } from "oxlint";
import { defineConfig } from "oxlint";

import { GLOB_EXCLUDE, GLOB_ROOT, GLOB_SRC } from "../globs.ts";
import { buildOxfmtOptions } from "../rules/oxfmt.ts";
import {
	getOverrides,
	isInAgentSession,
	isInEditorEnvironment,
	mergeGlobs,
	overrideRuleSeverity,
	resolveOxfmtConfigOptionsSync,
	resolveSubOptions,
} from "../utils.ts";
import { oxlintCeaseNonsense } from "./configs/cease-nonsense.ts";
import { oxlintComments } from "./configs/comments.ts";
import { oxlintDisables } from "./configs/disables.ts";
import { oxlintE18e } from "./configs/e18e.ts";
import { oxlintEslintPlugin } from "./configs/eslint-plugin.ts";
import { oxlintFlawless } from "./configs/flawless.ts";
import { oxlintGitignore } from "./configs/gitignore.ts";
import { oxlintImports } from "./configs/imports.ts";
import { oxlintJavascript } from "./configs/javascript.ts";
import { oxlintJsdoc } from "./configs/jsdoc.ts";
import { oxlintNode } from "./configs/node.ts";
import { oxlintOxfmt } from "./configs/oxfmt.ts";
import { oxlintPerfectionist } from "./configs/perfectionist.ts";
import { oxlintPromise } from "./configs/promise.ts";
import { oxlintReact } from "./configs/react.ts";
import { oxlintRoblox } from "./configs/roblox.ts";
import { oxlintSonarjs } from "./configs/sonarjs.ts";
import { oxlintSpelling } from "./configs/spelling.ts";
import { oxlintStylistic } from "./configs/stylistic.ts";
import { oxlintTest } from "./configs/test.ts";
import { oxlintTypescript } from "./configs/typescript.ts";
import { oxlintUnicorn } from "./configs/unicorn.ts";
import type { OxlintFactoryOptions, OxlintSettings, TypedOxlintConfigItem } from "./types.ts";
import { createOxlintConfigs } from "./utils.ts";

/**
 * Generate an oxlint configuration based on the provided options.
 *
 * The returned value is a plain oxlint config object suitable for
 * `oxlint.config.ts` (via `defineConfig`) or serialization to
 * `.oxlintrc.json`.
 *
 * @param factoryOptions - The options for generating the oxlint configuration.
 * @param userConfigs - Additional oxlint config fragments (merged as
 *   overrides).
 * @returns The oxlint configuration.
 */
export function isentinel(
	factoryOptions?: OxlintFactoryOptions,
	...userConfigs: Array<TypedOxlintConfigItem>
): OxlintConfig {
	const options = factoryOptions ?? { name: "isentinel" };
	const {
		componentExts: componentExtensions = [],
		e18e: enableE18e = true,
		env,
		eslintPlugin: enableEslintPlugin = false,
		formatters,
		gitignore: enableGitignore = true,
		globals,
		ignores,
		jsdoc: enableJsdoc = true,
		jsx: enableJsx = true,
		options: linterOptions,
		react: enableReact = false,
		root: customRootGlobs,
		rules = {},
		spellCheck: enableSpellCheck,
		test: enableTest = false,
	} = options;

	const rootGlobs = mergeGlobs(GLOB_ROOT, customRootGlobs);
	const enableRoblox = options.roblox !== false;
	const typeAware = linterOptions?.typeAware ?? isPackageExists("oxlint-tsgolint");

	const inAgentSession = options.isAgent ?? isInAgentSession();
	let { defaultSeverity, isInEditor } = options;
	if (defaultSeverity === undefined && inAgentSession) {
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
		if (options.stylistic === false) {
			return false;
		}

		if (typeof options.stylistic === "object") {
			return options.stylistic;
		}

		return {};
	})();

	if (stylisticOptions !== false && !("jsx" in stylisticOptions)) {
		stylisticOptions.jsx = enableJsx;
	}

	const formatterOptions = typeof formatters === "object" ? formatters : {};
	const prettierSettings: Record<string, unknown> = {
		arrowParens: "always",
		printWidth: 100,
		quoteProps: "consistent",
		semi: true,
		singleQuote: false,
		tabWidth: 4,
		trailingComma: "all",
		useTabs: true,
		...formatterOptions.prettierOptions,
	};

	const configs: Array<Array<TypedOxlintConfigItem>> = [
		oxlintJavascript({
			...getOverrides(options, "javascript"),
			isInEditor,
			roblox: enableRoblox,
			stylistic: stylisticOptions,
		}),
		oxlintImports({ stylistic: stylisticOptions, type: projectType }),
		oxlintPromise(),
		oxlintSonarjs({ isInEditor }),
		oxlintTypescript({
			...resolveSubOptions(options, "typescript"),
			...getOverrides(options, "typescript"),
			componentExts: componentExtensions,
			stylistic: stylisticOptions,
			typeAware,
		}),
		oxlintUnicorn({
			...resolveSubOptions(options, "unicorn"),
			roblox: enableRoblox,
			root: customRootGlobs,
			stylistic: stylisticOptions,
		}),
	];

	if (enableJsdoc !== false) {
		configs.push(
			oxlintJsdoc({
				...resolveSubOptions(options, "jsdoc"),
				stylistic: stylisticOptions,
				type: projectType,
			}),
		);
	}

	if (enableRoblox) {
		configs.push(
			oxlintRoblox({
				...getOverrides(options, "roblox"),
				componentExts: componentExtensions,
				stylistic: stylisticOptions,
			}),
		);
	}

	if (enableE18e !== false && !enableRoblox) {
		configs.push(
			oxlintE18e({
				isInEditor,
				...(enableE18e === true ? {} : enableE18e),
			}),
		);
	}

	if (projectType === "package" && !enableRoblox) {
		configs.push(oxlintNode());
	}

	if (enableTest !== false) {
		const testOptions = typeof enableTest === "object" ? enableTest : {};
		configs.push(
			oxlintTest({
				...getOverrides(options, "test"),
				isInEditor,
				roblox: enableRoblox,
				stylistic: stylisticOptions,
				type: projectType,
				...testOptions,
			}),
		);
	}

	if (stylisticOptions !== false) {
		configs.push(
			oxlintPerfectionist({
				...resolveSubOptions(options, "perfectionist"),
				type: projectType,
			}),
			oxlintStylistic(stylisticOptions, prettierSettings),
		);
	}

	if (enableReact !== false) {
		const reactOptions = typeof enableReact === "object" ? enableReact : {};
		configs.push(
			oxlintReact({
				stylistic: stylisticOptions,
				...reactOptions,
			}),
		);
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
		configs.push(
			oxlintEslintPlugin({
				...getOverrides(options, "eslintPlugin"),
			}),
		);
	}

	configs.push(
		oxlintCeaseNonsense({
			componentExts: componentExtensions,
			isInEditor,
			stylistic: stylisticOptions,
		}),
		oxlintFlawless({ stylistic: stylisticOptions }),
		oxlintComments({ prettierOptions: prettierSettings, stylistic: stylisticOptions }),
		oxlintDisables({ root: rootGlobs }),
	);

	if (stylisticOptions !== false && formatters !== false) {
		const oxfmtConfigOptions = resolveOxfmtConfigOptionsSync();

		// Oxfmt must be the last config
		configs.push(
			oxlintOxfmt({
				componentExts: componentExtensions,
				oxfmtOptions: buildOxfmtOptions({
					oxfmtConfigOptions,
					oxfmtOptions: formatterOptions.oxfmtOptions,
					prettierOptions: prettierSettings,
				}),
			}),
		);
	}

	// Merge fragments into overrides; hoist settings and jsPlugins to the top
	// level, deduplicated.
	const jsPlugins = new Map<string, ExternalPluginEntry>();
	const nativePlugins = new Set<string>();
	const overrides: Array<OxlintOverride> = [];
	const mergedSettings: OxlintSettings = {};

	const gitignorePatterns = enableGitignore !== false ? oxlintGitignore() : [];
	const ignorePatterns =
		typeof ignores === "function"
			? ignores([...GLOB_EXCLUDE, ...gitignorePatterns])
			: [...GLOB_EXCLUDE, ...gitignorePatterns, ...(ignores ?? [])];

	function mergeFragment(config: TypedOxlintConfigItem): void {
		const fragmentPlugins = config.plugins ?? [];
		for (const plugin of fragmentPlugins) {
			nativePlugins.add(plugin);
		}

		const fragmentJsPlugins = config.jsPlugins ?? [];
		for (const jsPlugin of fragmentJsPlugins) {
			const key = typeof jsPlugin === "string" ? jsPlugin : jsPlugin.name;
			jsPlugins.set(key, jsPlugin);
		}

		if (config.settings) {
			Object.assign(mergedSettings, config.settings);
		}

		const { name: _name, plugins: _plugins, settings: _settings, ...override } = config;
		overrides.push(override as OxlintOverride);
	}

	const fragments = configs.flat();
	for (const fragment of fragments) {
		mergeFragment(fragment);
	}

	if (Object.keys(rules).length > 0) {
		const optionsFragments = createOxlintConfigs({
			name: "isentinel/options-rules",
			files: [GLOB_SRC],
			keepUnmappedOff: true,
			rules,
		});
		for (const fragment of optionsFragments) {
			mergeFragment(fragment);
		}
	}

	if (globals && Object.keys(globals).length > 0) {
		mergeFragment({
			name: "isentinel/options-globals",
			files: [GLOB_SRC],
			globals,
		});
	}

	for (const userConfig of userConfigs) {
		mergeFragment(userConfig);
	}

	if (defaultSeverity) {
		const severityExcludeRules = new Set(["sonar/todo-tag"]);

		for (const override of overrides) {
			if (override.rules) {
				override.rules = overrideRuleSeverity(
					override.rules,
					defaultSeverity,
					severityExcludeRules,
				) as DummyRuleMap;
			}
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
		...(env ? { env } : {}),
		...(globals ? { globals } : {}),
		ignorePatterns,
		jsPlugins: [...jsPlugins.values()],
		options: {
			typeAware,
			...linterOptions,
		},
		overrides,
		plugins: [...nativePlugins] as OxlintConfig["plugins"],
		settings: mergedSettings,
	});
}
