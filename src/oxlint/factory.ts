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
import { resolvePrettierSettings } from "../prettier-config.ts";
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
import {
	anchorOxlintGlob,
	createOxlintConfigs,
	jsPluginKey,
	stripUnregisteredPluginRules,
} from "./utils.ts";

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
 * JsPlugins the preset keeps even under `jsPlugins: false`.
 *
 * `oxlint-comments` lints the `oxlint-disable` directives that native rules
 * still need, and the ESLint side cannot take it over: its rules use oxlint's
 * `createOnce` API, which ESLint rejects. Its rules visit `Program` once per
 * file, so the cost is negligible next to the jsPlugin rule set that native-only
 * mode exists to avoid.
 */
const NATIVE_ONLY_JS_PLUGINS: ReadonlySet<string> = new Set(["oxlint-comments"]);

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
		jsPlugins: userJsPlugins,
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

	// Native-only mode: oxlint runs its Rust rules (and tsgolint) and nothing
	// else. Every preset fragment that needs a jsPlugin is stripped, so the
	// ESLint side (`oxlint: "native"`) keeps those rules.
	const nativeOnly = userJsPlugins === false;

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
	// Shared with the ESLint factory: these settings feed rule options (for
	// example `flawless/arrow-return-style`'s `maxLen`), so both engines must
	// resolve them identically or their fixes disagree.
	const prettierSettings: Record<string, unknown> = resolvePrettierSettings(
		formatterOptions.prettierOptions,
	);

	const configs: Array<Array<TypedOxlintConfigItem>> = [
		oxlintJavascript({
			...getOverrides(options, "javascript"),
			isInEditor,
			roblox: enableRoblox,
			stylistic: stylisticOptions,
		}),
		oxlintImports({ roblox: enableRoblox, stylistic: stylisticOptions }),
		oxlintPromise(),
		oxlintSonarjs({ isInEditor, roblox: enableRoblox }),
		oxlintTypescript({
			...resolveSubOptions(options, "typescript"),
			...getOverrides(options, "typescript"),
			componentExts: componentExtensions,
			roblox: enableRoblox,
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

	// Re-apply the non-roblox JS, TS and unicorn rules to the complement (files
	// outside the roblox scope), overriding the roblox-flavored base there.
	if (needsComplementOverlay) {
		configs.push(
			oxlintTypescript({
				...resolveSubOptions(options, "typescript"),
				...getOverrides(options, "typescript"),
				componentExts: componentExtensions,
				excludeFiles: robloxScopedFiles,
				roblox: false,
				stylistic: stylisticOptions,
				typeAware,
			}),
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
			oxlintImports({
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
			oxlintStylistic(stylisticOptions),
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
		oxlintFlawless({ stylistic: stylisticOptions }, prettierSettings),
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

	/**
	 * Merge a fragment into the accumulated overrides.
	 *
	 * @param config - The fragment to merge.
	 */
	function mergeFragment(config: TypedOxlintConfigItem): void {
		const fragmentJsPlugins = config.jsPlugins ?? [];
		const fragmentPlugins = config.plugins ?? [];

		for (const plugin of fragmentPlugins) {
			nativePlugins.add(plugin);
		}

		for (const jsPlugin of fragmentJsPlugins) {
			jsPlugins.set(jsPluginKey(jsPlugin), jsPlugin);
		}

		if (config.settings) {
			Object.assign(mergedSettings, config.settings);
		}

		const { name: _name, plugins: _plugins, settings: _settings, ...override } = config;
		override.files = override.files.map(anchorOxlintGlob);
		if (override.excludeFiles !== undefined) {
			override.excludeFiles = override.excludeFiles.map(anchorOxlintGlob);
		}

		overrides.push(override);
	}

	// Native-only mode drops the preset's jsPlugin fragments outright (bar the
	// `NATIVE_ONLY_JS_PLUGINS` exception). Every one is produced separately from
	// its native sibling (see `createOxlintConfigs`) or hand-written as a plugin
	// registration, so the whole fragment goes — except its `settings`, which are
	// engine-wide and stay in fragment order so the same writer wins as it would
	// with the fragment kept.
	for (const fragment of configs.flat()) {
		if (nativeOnly && droppedByNativeOnly(fragment)) {
			if (fragment.settings) {
				Object.assign(mergedSettings, fragment.settings);
			}

			continue;
		}

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
			// `options.rules` must not pull a jsPlugin back in under native-only
			// mode. The rules stay: the strip below keeps the ones whose plugin a
			// user config still registers and drops the rest.
			const { jsPlugins: _fragmentJsPlugins, ...withoutJsPlugins } = fragment;
			mergeFragment(nativeOnly ? withoutJsPlugins : fragment);
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

	if (Array.isArray(userJsPlugins)) {
		for (const jsPlugin of userJsPlugins) {
			jsPlugins.set(jsPluginKey(jsPlugin), jsPlugin);
		}
	}

	// Oxlint rejects the whole config when a rule names a plugin that is not
	// registered, so a rule left over from a plugin native-only mode dropped
	// (a `sonar/*` entry in the consumer's own config, say) would fail the
	// build rather than sit inert. Drop those; the ESLint side runs them.
	if (nativeOnly) {
		stripUnregisteredPluginRules(overrides, new Set([...nativePlugins, ...jsPlugins.keys()]));
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

/**
 * Whether native-only mode drops a preset fragment: it needs a jsPlugin, and at
 * least one of them is not kept in that mode.
 *
 * @param fragment - The preset fragment.
 * @returns Whether the fragment is dropped.
 */
function droppedByNativeOnly(fragment: TypedOxlintConfigItem): boolean {
	const fragmentJsPlugins = fragment.jsPlugins ?? [];
	return (
		fragmentJsPlugins.length > 0 &&
		fragmentJsPlugins.some((entry) => !NATIVE_ONLY_JS_PLUGINS.has(jsPluginKey(entry)))
	);
}
