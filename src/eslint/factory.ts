import { FlatConfigComposer as FlatConfigComposerClass } from "eslint-flat-config-utils";
import type { ResolvableFlatConfig } from "eslint-flat-config-utils";
import { findUpSync } from "find-up-simple";

import { GLOB_MARKDOWN } from "../globs.ts";
import { writeHybridStatusForCwd } from "../hybrid-status.ts";
import {
	editorConfigOverrides,
	oxfmtIndent,
	resolvePrettierSettings,
	withOxfmtStyle,
	withOxfmtWidths,
} from "../prettier-config.ts";
import { buildOxfmtOptions, migratePrettierOverrides } from "../rules/oxfmt.ts";
import { mergeRestrictedDomImportRule } from "../rules/react.ts";
import type { RuleOptions } from "../typegen.d.ts";
import {
	findWorkspaceRootSync,
	getOverrides,
	hasTypeAwareBackend,
	isAgentAutofixDisabled,
	isInAgentSession,
	isInEditorEnvironment,
	jsonLayoutOverrides,
	overrideRuleSeverity,
	resolveNodeMajor,
	resolveOxfmtConfig,
	resolveRootGlobs,
	resolveSubOptions,
	shouldEnableFeature,
	toSourceGlob,
	typeAwareSplitFromEnvironment,
	warnScriptWidthOverrides,
	warnStandaloneOptions,
} from "../utils.ts";
import type { ResolvedOxfmtConfig } from "../utils.ts";
import {
	comments,
	disables,
	e18e,
	eslintPlugin,
	flawless,
	gitignore,
	ignores,
	imports,
	javascript,
	jsdoc,
	jsonc,
	markdown,
	naming,
	node,
	oxfmt,
	perfectionist,
	pnpm,
	projectStructure,
	promise,
	react,
	roblox,
	smallRules,
	sonarjs,
	sortCspell,
	sortGithubAction,
	sortMiseToml,
	sortPnpmWorkspace,
	sortRojoProject,
	sortTsconfig,
	stylistic,
	test,
	toml,
	typescript,
	unicorn,
	yaml,
} from "./configs/index.ts";
import { jsx } from "./configs/jsx.ts";
import { packageJson } from "./configs/package-json.ts";
import { spelling } from "./configs/spelling.ts";
import type { OxlintHybridMode } from "./oxlint-drop.ts";
import { defaultPluginRenaming } from "./plugin-renaming.ts";
import { applyTypeAwareSplit } from "./type-aware-split.ts";
import type { TypeAwareSplitMode } from "./type-aware-split.ts";
import type {
	Awaitable,
	ConfigNames,
	FlatConfigComposer,
	NamedFlatConfigItem,
	OptionsConfig,
	TypedFlatConfigItem,
} from "./types.ts";

/** The options shape every overload accepts. */
type Options = Omit<TypedFlatConfigItem, "ignores"> & OptionsConfig;

/** A single accepted rest-argument shape. */
type UserConfig = Awaitable<
	Array<TypedFlatConfigItem> | FlatConfigComposer<any, any> | TypedFlatConfigItem
>;

/** The named-configs counterpart of {@linkcode UserConfig}. */
type NamedUserConfig = Awaitable<
	Array<NamedFlatConfigItem> | FlatConfigComposer<any, any> | NamedFlatConfigItem
>;

const flatConfigProps: Array<keyof TypedFlatConfigItem> = [
	"name",
	"files",
	"ignores",
	"languageOptions",
	"linterOptions",
	"processor",
	"plugins",
	"rules",
	"settings",
];

export { defaultPluginRenaming } from "./plugin-renaming.ts";

/**
 * Generates an array of user configuration items based on the provided options
 * and user configs.
 *
 * With a literal `namedConfigs: true`, every rest config item must carry a
 * `name`. A widened `boolean` adds no requirement.
 *
 * @template Named - The inferred `namedConfigs` value.
 * @param options - The options for generating the user configuration items.
 * @param userConfigs - Additional user configuration items.
 * @returns A promise that resolves to an array of user configuration items.
 * @rejects Will throw an error if configuration generation fails.
 */
export function isentinel<Named extends boolean = false>(
	options: Options & { namedConfigs?: Named },
	...userConfigs: Array<[Named] extends [true] ? NamedUserConfig : UserConfig>
): Promise<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>;
export async function isentinel(
	options: Options,
	...userConfigs: Array<UserConfig>
): Promise<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>> {
	const {
		antiSlop = false,
		autoRenamePlugins = true,
		componentExts: componentExtensions = [],
		e18e: enableE18e = true,
		eslintPlugin: enableEslintPlugin = false,
		formatter = "eslint",
		formatters,
		gitignore: enableGitignore = true,
		jsdoc: enableJsdoc = true,
		jsonc: enableJsonc = true,
		jsx: enableJsx = true,
		markdown: enableMarkdown = true,
		oxlint: enableOxlint = false,
		pnpm: enableCatalogs = findUpSync("pnpm-workspace.yaml") !== undefined,
		projectStructure: enableProjectStructure = false,
		react: enableReact = false,
		root: customRootGlobs,
		spellCheck: enableSpellCheck,
		toml: enableToml = true,
		yaml: enableYaml = true,
	} = options;

	const { excludes: rootExcludes, files: rootGlobs } = resolveRootGlobs(customRootGlobs);
	const enableRoblox = options.roblox !== false;
	const reactOptions = resolveSubOptions(options, "react");
	const restrictedDomPackage =
		enableReact !== false && reactOptions.testing === true
			? options.settings?.["testing-library"]?.domPackage
			: undefined;

	// Hybrid mode is off, full (oxlint owns every mapped rule) or native-only
	// (oxlint owns just the Rust rules; jsPlugin rules and formatting stay here).
	const oxlintMode: "off" | OxlintHybridMode = (() => {
		if (enableOxlint === false) {
			return "off";
		}

		return enableOxlint === "native" ? "native" : "full";
	})();

	// When `roblox` is scoped to specific files (or disabled entirely) the files
	// it does not cover form the "complement": standard-TS/Node land that gets
	// node rules, e18e and the non-roblox JS/unicorn rules instead of the
	// roblox-flavored set. `robloxScopedFiles` is the roblox glob when the scope
	// is explicit; `undefined` for `roblox: false` (whole tree is complement) and
	// for the default/unscoped case (no complement, preserving the old
	// footprint).
	const robloxScopedFiles =
		typeof options.roblox === "object" && options.roblox.files !== undefined
			? options.roblox.files.flat()
			: undefined;
	const hasComplement = !enableRoblox || robloxScopedFiles !== undefined;
	const needsComplementOverlay = enableRoblox && robloxScopedFiles !== undefined;

	// An explicit `typeAware` option always wins; the `ESLINT_TYPE_AWARE` env var
	// only applies when the option is left undefined (any non-split value such as
	// `true` still counts as explicit and disables the split).
	let typeAwareMode: TypeAwareSplitMode | undefined;
	if (options.typeAware === false || options.typeAware === "only") {
		typeAwareMode = options.typeAware;
	} else if (options.typeAware === undefined) {
		typeAwareMode = typeAwareSplitFromEnvironment();
	}

	const typeAwareOnly = typeAwareMode === "only";
	const typescriptOptions = resolveSubOptions(options, "typescript");
	if (
		typeAwareOnly &&
		"typeAware" in typescriptOptions &&
		typescriptOptions.typeAware === false
	) {
		throw new Error(
			'[@isentinel/eslint-config] `typeAware: "only"` requires type-aware linting; do not combine it with `typescript.typeAware: false`.',
		);
	}

	const sharedIgnoresTypeAware =
		"ignoresTypeAware" in typescriptOptions ? typescriptOptions.ignoresTypeAware : undefined;
	const rootIgnoresTypeAware =
		"typeAwareRoot" in typescriptOptions && typescriptOptions.typeAwareRoot === false
			? [...rootGlobs.map(toSourceGlob), ...rootExcludes.map((glob) => `!${glob}`)]
			: [];

	function typeAwareIgnores(own?: Array<string>): { ignoresTypeAware?: Array<string> } {
		const resolved = own ?? sharedIgnoresTypeAware;
		if (rootIgnoresTypeAware.length === 0) {
			return resolved === undefined ? {} : { ignoresTypeAware: resolved };
		}

		return { ignoresTypeAware: [...rootIgnoresTypeAware, ...(resolved ?? [])] };
	}

	const inAgentSession = options.isAgent ?? isInAgentSession();
	let { defaultSeverity, isInEditor } = options;
	if (defaultSeverity === undefined && inAgentSession) {
		defaultSeverity = "error";
	}

	if (isInEditor === undefined) {
		isInEditor = isInEditorEnvironment();
		if (isInEditor) {
			// oxlint-disable-next-line no-console -- Info for plugin
			console.log(
				"[@isentinel/eslint-config] Detected running in editor, some rules are disabled.",
			);
		}
	}

	const projectType = (() => {
		if (options.type === "app") {
			return "game";
		}

		if (options.type !== undefined) {
			return options.type;
		}

		return enableRoblox ? "game" : "package";
	})();

	if (formatter === "standalone") {
		warnStandaloneOptions(options);
	}

	// Standalone oxfmt never sees these, so the widths must not use them.
	const formatterOptions =
		formatter !== "standalone" && typeof formatters === "object" ? formatters : {};
	// Standalone oxfmt formats whatever these options say, so the widths and
	// style must always come from its config.
	const oxfmtFormats =
		formatter === "standalone" || (formatters !== false && options.stylistic !== false);

	const oxfmtConfig: ResolvedOxfmtConfig = oxfmtFormats
		? await resolveOxfmtConfig()
		: { options: {} };
	const oxfmtConfigOptions = oxfmtConfig.options;

	// Shared with the oxlint factory: these settings feed rule options (for
	// example `flawless/arrow-return-style`'s `maxLen`), so both engines must
	// resolve them identically or their fixes disagree.
	const prettierSettings = resolvePrettierSettings(formatterOptions.prettierOptions);
	const effectiveOxfmtOptions = buildOxfmtOptions({
		oxfmtConfigOptions,
		oxfmtOptions: formatterOptions.oxfmtOptions,
		prettierOptions: prettierSettings,
	});
	const widthSettings = withOxfmtWidths(prettierSettings, effectiveOxfmtOptions);

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

	// The `.editorconfig` sections, as the rule's config loader applies them.
	const sectionOverrides = oxfmtFormats
		? editorConfigOverrides(undefined, oxfmtConfigOptions)
		: [];
	warnScriptWidthOverrides(sectionOverrides, ".editorconfig");

	const configs: Array<Awaitable<Array<TypedFlatConfigItem>>> = [];

	if (enableGitignore !== false) {
		configs.push(
			gitignore({
				config: enableGitignore,
				explicit: "gitignore" in options,
			}),
		);
	}

	// Base configs
	configs.push(
		smallRules({ isInEditor, stylistic: stylisticOptions }),
		comments({ prettierOptions: widthSettings, stylistic: stylisticOptions }),
		flawless(
			{
				...(needsComplementOverlay ? { complementIgnores: robloxScopedFiles } : {}),
				...typeAwareIgnores(),
				...("tsconfigPath" in typescriptOptions
					? { tsconfigPath: typescriptOptions.tsconfigPath }
					: {}),
				...("typeAware" in typescriptOptions
					? { typeAware: typescriptOptions.typeAware }
					: {}),
				antiSlop,
				roblox: enableRoblox,
				stylistic: stylisticOptions,
			},
			widthSettings,
		),
		ignores(options.ignores),
		imports({ stylistic: stylisticOptions, type: projectType }),
		packageJson({
			...options.packageJson,
			roblox: enableRoblox,
			stylistic: stylisticOptions,
			type: projectType,
		}),
		javascript({
			...getOverrides(options, "javascript"),
			...(needsComplementOverlay ? { complementIgnores: robloxScopedFiles } : {}),
			isInEditor,
			roblox: enableRoblox,
			stylistic: stylisticOptions,
		}),
		promise(),
		sonarjs({
			...(needsComplementOverlay ? { complementIgnores: robloxScopedFiles } : {}),
			isInEditor,
			roblox: enableRoblox,
		}),
		typescript({
			...resolveSubOptions(options, "typescript"),
			...getOverrides(options, "typescript"),
			...typeAwareIgnores(),
			...(needsComplementOverlay ? { complementIgnores: robloxScopedFiles } : {}),
			componentExts: componentExtensions,
			roblox: enableRoblox,
			stylistic: stylisticOptions,
		}),
		unicorn({
			...resolveSubOptions(options, "unicorn"),
			...(needsComplementOverlay ? { complementIgnores: robloxScopedFiles } : {}),
			roblox: enableRoblox,
			root: rootGlobs,
			rootExcludes,
			stylistic: stylisticOptions,
		}),
	);

	if (options.naming !== undefined && options.naming !== false) {
		configs.push(
			naming({
				roblox: enableRoblox,
				...getOverrides(options, "naming"),
				...resolveSubOptions(options, "naming"),
				...typeAwareIgnores(getOverrides(options, "naming").ignoresTypeAware),
			}),
		);
	}

	if (enableJsdoc !== false) {
		configs.push(
			jsdoc({
				...resolveSubOptions(options, "jsdoc"),
				stylistic: stylisticOptions,
				type: projectType,
			}),
		);
	}

	if (enableE18e !== false && hasComplement) {
		configs.push(
			e18e({
				ignores: robloxScopedFiles,
				isInEditor,
				nodeMajor: resolveNodeMajor(options.settings),
				type: projectType,
				...(enableE18e === true ? {} : enableE18e),
			}),
		);
	}

	// Node rules cover the complement: any TS/JS file outside the roblox scope
	// runs in a standard-TS/Node environment, independent of the game/package
	// distinction.
	if (hasComplement) {
		configs.push(
			node({ ignores: robloxScopedFiles, nodeMajor: resolveNodeMajor(options.settings) }),
		);
	}

	if (enableJsx) {
		configs.push(jsx());
	}

	if (enableEslintPlugin !== false) {
		configs.push(
			eslintPlugin({
				...getOverrides(options, "eslintPlugin"),
			}),
		);
	}

	if (enableRoblox) {
		const shouldFormatLua = shouldEnableFeature(formatters, "lua") && !typeAwareOnly;
		configs.push(
			roblox(
				{
					...resolveSubOptions(options, "typescript"),
					...getOverrides(options, "roblox"),
					...typeAwareIgnores(getOverrides(options, "roblox").ignoresTypeAware),
					componentExts: componentExtensions,
					stylistic: stylisticOptions,
				},
				shouldFormatLua,
			),
		);
	}

	if (stylisticOptions !== false) {
		configs.push(
			// Only the JS/TS stylistic rules follow oxfmt's indent and quotes:
			// other consumers (TOML) format files oxfmt does not touch.
			stylistic(
				oxfmtFormats
					? withOxfmtStyle(stylisticOptions, effectiveOxfmtOptions)
					: stylisticOptions,
			),
			perfectionist({ ...resolveSubOptions(options, "perfectionist"), type: projectType }),
		);
	}

	if (options.test !== undefined && options.test !== false) {
		const testOptions = typeof options.test === "object" ? options.test : {};
		configs.push(
			test({
				...getOverrides(options, "test"),
				isInEditor,
				roblox: enableRoblox,
				type: projectType,
				...testOptions,
			}),
		);
	}

	// Composed in "only" mode too, with its rule stripped by the split: the
	// source disable comments have to resolve in the type-aware pass as well.
	if (enableProjectStructure !== false) {
		configs.push(projectStructure(resolveSubOptions(options, "projectStructure")));
	}

	if (enableReact !== false) {
		configs.push(
			react({
				...resolveSubOptions(options, "react"),
				...getOverrides(options, "react"),
				...typeAwareIgnores(getOverrides(options, "react").ignoresTypeAware),
				settings: options.settings,
			}),
		);
	}

	if (enableJsonc !== false && !typeAwareOnly) {
		configs.push(
			jsonc({
				...getOverrides(options, "jsonc"),
				bracketSpacing: !oxfmtFormats || effectiveOxfmtOptions["bracketSpacing"] !== false,
				...(oxfmtFormats
					? {
							formatIndent: oxfmtIndent(effectiveOxfmtOptions),
							layoutOverrides: jsonLayoutOverrides([
								...sectionOverrides,
								...(oxfmtConfig.overrides ?? []),
								...migratePrettierOverrides(prettierSettings["overrides"]),
							]),
						}
					: {}),
				singleQuote: oxfmtFormats && effectiveOxfmtOptions["singleQuote"] === true,
				stylistic: stylisticOptions,
			}),
		);

		if (stylisticOptions !== false) {
			configs.push(sortTsconfig());
		}

		if (enableRoblox) {
			configs.push(sortRojoProject());
		}
	}

	if (enableYaml !== false && !typeAwareOnly) {
		configs.push(
			yaml({
				...getOverrides(options, "yaml"),
				antiSlop,
				prettierOptions: widthSettings,
				stylistic: stylisticOptions,
			}),
		);

		if (stylisticOptions !== false) {
			configs.push(sortGithubAction());
		}
	}

	if (enableCatalogs !== false && !typeAwareOnly) {
		configs.push(
			pnpm({
				isInEditor,
				...resolveSubOptions(options, "pnpm"),
			}),
		);

		if (stylisticOptions !== false) {
			configs.push(sortPnpmWorkspace());
		}
	}

	if (enableToml !== false && !typeAwareOnly) {
		configs.push(
			toml({
				...getOverrides(options, "toml"),
				antiSlop,
				stylistic: stylisticOptions,
			}),
		);

		if (stylisticOptions !== false) {
			configs.push(sortMiseToml());
		}
	}

	if (enableMarkdown !== false && !typeAwareOnly) {
		configs.push(
			markdown({
				...getOverrides(options, "markdown"),
				antiSlop,
				componentExts: componentExtensions,
				type: projectType,
			}),
		);
	}

	// Composed in "only" mode too, with its rules stripped by the split: the
	// spelling rules apply to real TS files, so a source `eslint-disable` for
	// them would otherwise hit "definition for rule was not found" in the
	// type-aware pass, where the plugin would not be registered.
	if (enableSpellCheck !== false) {
		configs.push(
			spelling({
				...resolveSubOptions(options, "spellCheck"),
				componentExts: componentExtensions,
				isInEditor,
			}),
		);

		if (stylisticOptions !== false && enableYaml !== false && !typeAwareOnly) {
			configs.push(sortCspell());
		}
	}

	// Passively record the hybrid status so `isentinel-lint` can tell, without
	// re-running the config, whether oxlint would double-lint every mapped rule.
	// Best-effort and swallowed; config evaluation must never throw for this.
	// Only an isentinel-lint ESLint child writes, so other configs built in the
	// same project root (tests, scripts) cannot overwrite it.
	writeHybridStatusForCwd(oxlintMode !== "off");

	// Stamp a marker observable from outside via `eslint --print-config`: the CLI
	// probes for `settings["isentinel/oxlint"]` when the cached status is stale.
	if (oxlintMode !== "off") {
		configs.push([
			{
				name: "isentinel/oxlint-marker",
				settings: { "isentinel/oxlint": true },
			},
		]);
	}

	configs.push(
		disables({ root: rootGlobs, rootExcludes, workspaceRoot: findWorkspaceRootSync() }),
	);

	// As with spelling above, composed in "only" mode so `oxfmt/oxfmt` resolves
	// in disable comments; the split strips the rule itself.
	if (stylisticOptions !== false) {
		// Oxfmt must be the last config
		configs.push(
			oxfmt({
				componentExts: componentExtensions,
				editorConfigOverrides: sectionOverrides,
				formatters:
					typeAwareOnly || formatters === false
						? {
								css: false,
								graphql: false,
								html: false,
								json: false,
								markdown: false,
								yaml: false,
							}
						: formatters,
				oxfmtConfigOptions,
				oxfmtIgnorePatterns: oxfmtConfig.ignorePatterns,
				oxfmtOptions: formatterOptions.oxfmtOptions,
				// Native-only hybrid keeps formatting in ESLint: oxfmt runs in
				// oxlint as a jsPlugin, which that mode does not load.
				oxlint: oxlintMode === "full",
				prettierOptions: prettierSettings,
				standalone: formatter === "standalone",
			}),
		);
	}

	if ("files" in options) {
		throw new Error(
			'[@isentinel/eslint-config] The first argument should not contain the "files" property as the options are supposed to be global. Place it in the second or later config instead.',
		);
	}

	// User can optionally pass a flat config item to the first argument
	// We pick the known keys as ESLint would do schema validation
	const fusedConfig = flatConfigProps.reduce<TypedFlatConfigItem>((accumulator, key) => {
		if (key in options) {
			Object.assign(accumulator, { [key]: options[key] });
		}

		return accumulator;
	}, {});
	if (Object.keys(fusedConfig).length) {
		configs.push([fusedConfig]);
	}

	let composer = new FlatConfigComposerClass<TypedFlatConfigItem, ConfigNames>();

	// `ResolvableFlatConfig` does not model an awaitable resolving to a composer,
	// which the public `userConfigs` type permits and `append` resolves at
	// runtime.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- lib type narrower than the accepted runtime input
	const resolvableUserConfigs = userConfigs as Array<ResolvableFlatConfig<TypedFlatConfigItem>>;
	composer = composer.append(...configs, ...resolvableUserConfigs);

	// Markdown uses the `markdown/gfm` language, whose `SourceCode` lacks
	// JS-only methods like `getAllComments`. Without this, any rule override
	// registered without a `files` constraint would apply globally and crash on
	// `.md` files.
	if (options.markdown !== false) {
		composer = composer.setDefaultIgnores((previous) => {
			return [...previous, GLOB_MARKDOWN];
		});
	}

	if (restrictedDomPackage !== undefined) {
		composer = composer.onResolved((resolved) => {
			for (const config of resolved) {
				const restrictedImports = config.rules?.["no-restricted-imports"];
				if (restrictedImports === undefined) {
					continue;
				}

				config.rules = {
					...config.rules,
					"no-restricted-imports": mergeRestrictedDomImportRule(
						restrictedImports,
						restrictedDomPackage,
					),
				};
			}
		});
	}

	if (autoRenamePlugins) {
		composer = composer.renamePlugins(defaultPluginRenaming);
	}

	if (oxlintMode !== "off") {
		// Imported here rather than at module scope: this module pulls in the
		// generated Oxlint capability data, which nothing reads when hybrid mode
		// is off (the default). Keeping it off the static graph saves every
		// plain ESLint run from parsing it.
		const { dropOxlintCoveredRules, warnDeadMappedRules, warnMissingTypeAwareBackend } =
			await import("./oxlint-drop.ts");

		const typeAwareAvailable = hasTypeAwareBackend();
		if (!typeAwareAvailable) {
			warnMissingTypeAwareBackend();
		}

		// Hybrid mode: Oxlint owns every rule the resolver routes to it, so drop
		// them from the ESLint configs. Type-aware rules are kept in ESLint when
		// no type-aware backend (tsrs or oxlint-tsgolint) is installed so they do
		// not vanish entirely.
		composer = composer.onResolved((resolved) => {
			if (options.oxlintWarnDeadRules !== false) {
				warnDeadMappedRules(resolved, oxlintMode);
			}

			dropOxlintCoveredRules(resolved, typeAwareAvailable, oxlintMode);
		});
	}

	if (typeAwareMode !== undefined) {
		composer = composer.onResolved((resolved) => {
			applyTypeAwareSplit(resolved, typeAwareMode, options.typeAwareRules);
		});
	}

	const suppressAgentAutofix = isAgentAutofixDisabled();

	if (isInEditor || suppressAgentAutofix) {
		const disableAutofixRules: Array<keyof RuleOptions> = [];

		if (isInEditor) {
			disableAutofixRules.push(
				"no-useless-return",
				"prefer-const",
				"unused-imports/no-unused-imports",
			);

			if (enableRoblox) {
				disableAutofixRules.push("unicorn/no-for-each");
			}
		}

		if (suppressAgentAutofix) {
			disableAutofixRules.push("ts/consistent-type-imports");
		}

		composer = composer.disableRulesFix(disableAutofixRules, {
			builtinRules: async () => {
				const rules = await import("eslint/use-at-your-own-risk");
				// oxlint-disable-next-line typescript/no-deprecated -- No non-deprecated API exposes the built-in rule map.
				return rules.builtinRules;
			},
		});
	}

	if (defaultSeverity) {
		const severityExcludeRules = new Set(["sonar/todo-tag"]);

		composer = composer.onResolved((item) => {
			for (const config of item) {
				if (config.rules) {
					config.rules = overrideRuleSeverity(
						config.rules,
						defaultSeverity,
						severityExcludeRules,
					);
				}
			}
		});
	}

	return composer;
}
