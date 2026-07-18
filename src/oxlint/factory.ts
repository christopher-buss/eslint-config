import { isPackageExists } from "local-pkg";
import type {
	DummyRuleMap,
	ExternalPluginEntry,
	OxlintConfig,
	OxlintOverride,
	RuleCategories,
} from "oxlint";
import { defineConfig } from "oxlint";

import { GLOB_EXCLUDE, GLOB_ROOT, GLOB_SRC } from "../globs.ts";
import { buildOxfmtOptions } from "../rules/oxfmt.ts";
import type { Rules } from "../types.ts";
import {
	getOverrides,
	isInAgentSession,
	isInEditorEnvironment,
	mergeGlobs,
	overrideRuleSeverity,
	resolveNodeMajor,
	resolveOxfmtConfigOptionsSync,
	resolveSubOptions,
} from "../utils.ts";
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
import { oxlintOxc } from "./configs/oxc.ts";
import { oxlintOxfmt } from "./configs/oxfmt.ts";
import { oxlintPerfectionist } from "./configs/perfectionist.ts";
import { oxlintPromise } from "./configs/promise.ts";
import { oxlintReact } from "./configs/react.ts";
import { oxlintRoblox } from "./configs/roblox.ts";
import { oxlintSmallRules } from "./configs/small-rules.ts";
import { oxlintSonarjs } from "./configs/sonarjs.ts";
import { oxlintSpelling } from "./configs/spelling.ts";
import { oxlintStylistic } from "./configs/stylistic.ts";
import { oxlintTest } from "./configs/test.ts";
import { oxlintTypescript } from "./configs/typescript.ts";
import { oxlintUnicorn } from "./configs/unicorn.ts";
import type { ValidateOxlintOptions } from "./redundancy.ts";
import type { OxlintFactoryOptions, OxlintSettings, TypedOxlintConfigItem } from "./types.ts";
import { createOxlintConfigs } from "./utils.ts";

/**
 * The preset enables its rules explicitly, so every category is disabled to
 * stop oxlint's own defaults (notably `correctness: "warn"`) from firing on top
 * of the curated set.
 */
const DEFAULT_CATEGORIES: RuleCategories = {
	correctness: "off",
	nursery: "off",
	pedantic: "off",
	perf: "off",
	restriction: "off",
	style: "off",
	suspicious: "off",
};

/**
 * Generate an oxlint configuration based on the provided options.
 *
 * The returned value is a plain oxlint config object suitable for
 * `oxlint.config.ts` (via `defineConfig`) or serialization to
 * `.oxlintrc.json`.
 *
 * @template O - The literal options type, used by the redundant-override
 *   check. Rest-argument fragments are not validated — they always carry
 *   `files` globs, which the type-level check cannot reason about.
 * @param factoryOptions - The options for generating the oxlint configuration.
 * @param userConfigs - Additional oxlint config fragments (merged as
 *   overrides).
 * @returns The oxlint configuration.
 */
export function isentinel<const O extends OxlintFactoryOptions>(
	factoryOptions?: O & ValidateOxlintOptions<O>,
	...userConfigs: Array<TypedOxlintConfigItem>
): OxlintConfig;
/**
 * Implementation signature; the public overload above carries the
 * redundant-override validation generics.
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
		categories,
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
		oxc: enableOxc = true,
		react: enableReact = false,
		root: customRootGlobs,
		rules = {},
		spellCheck: enableSpellCheck,
		test: enableTest = false,
	} = options;

	const rootGlobs = mergeGlobs(GLOB_ROOT, customRootGlobs);
	const enableRoblox = options.roblox !== false;

	// See the ESLint factory: files outside a scoped `roblox` glob form the
	// standard-TS/Node complement. `undefined` means no complement (default /
	// unscoped) or the whole tree is the complement (`roblox: false`).
	const robloxScopedFiles =
		typeof options.roblox === "object" && options.roblox.files !== undefined
			? options.roblox.files.flat()
			: undefined;
	const hasComplement = !enableRoblox || robloxScopedFiles !== undefined;
	const needsComplementOverlay = enableRoblox && robloxScopedFiles !== undefined;

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

	// Re-apply the non-roblox JS and unicorn rules to the complement (files
	// outside the roblox scope), overriding the roblox-flavored base there.
	if (needsComplementOverlay) {
		configs.push(
			oxlintJavascript({
				...getOverrides(options, "javascript"),
				excludeFiles: robloxScopedFiles,
				isInEditor,
				roblox: false,
				stylistic: stylisticOptions,
			}),
			oxlintUnicorn({
				...resolveSubOptions(options, "unicorn"),
				excludeFiles: robloxScopedFiles,
				roblox: false,
				stylistic: stylisticOptions,
			}),
		);
	}

	if (enableE18e !== false && hasComplement) {
		configs.push(
			oxlintE18e({
				excludeFiles: robloxScopedFiles,
				isInEditor,
				nodeMajor: resolveNodeMajor(options.settings),
				type: projectType,
				...(enableE18e === true ? {} : enableE18e),
			}),
		);
	}

	// Node rules cover the complement regardless of the game/package distinction.
	if (hasComplement) {
		configs.push(oxlintNode({ excludeFiles: robloxScopedFiles }));
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

	if (enableOxc) {
		configs.push(oxlintOxc({ roblox: enableRoblox }));
		if (needsComplementOverlay) {
			configs.push(oxlintOxc({ excludeFiles: robloxScopedFiles, roblox: false }));
		}
	}

	configs.push(
		oxlintSmallRules({
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
		overrides.push(override);
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
			// The split accepts eslint-named rules and translates them; the
			// oxlint-facing `OxlintRules` typing cannot express that input.
			rules: rules as Rules,
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
		categories: { ...DEFAULT_CATEGORIES, ...categories },
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
