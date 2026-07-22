import { FlatConfigComposer as FlatConfigComposerClass } from "eslint-flat-config-utils";
import { findUpSync } from "find-up-simple";
import { isPackageExists } from "local-pkg";

import { GLOB_MARKDOWN, GLOB_ROOT } from "../globs.ts";
import { writeHybridStatusForCwd } from "../hybrid-status.ts";
import { resolvePrettierSettings } from "../prettier-config.ts";
import type { RuleOptions } from "../typegen.d.ts";
import {
	getOverrides,
	isInAgentSession,
	isInEditorEnvironment,
	mergeGlobs,
	overrideRuleSeverity,
	resolveNodeMajor,
	resolveOxfmtConfigOptions,
	resolveSubOptions,
	shouldEnableFeature,
	typeAwareSplitFromEnvironment,
} from "../utils.ts";
import type { PrettierOptions } from "./configs/index.ts";
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
import { dropOxlintCoveredRules, warnDeadMappedRules, warnMissingTsgolint } from "./oxlint-drop.ts";
import type { OxlintHybridMode } from "./oxlint-drop.ts";
import { defaultPluginRenaming } from "./plugin-renaming.ts";
import type { ValidateOptions, ValidateUserConfigs } from "./redundancy.ts";
import { applyTypeAwareSplit } from "./type-aware-split.ts";
import type { TypeAwareSplitMode } from "./type-aware-split.ts";
import type {
	Awaitable,
	ConfigNames,
	FlatConfigComposer,
	NamedFlatConfigItem,
	NamedOptionsConfig,
	OptionsConfig,
	TypedFlatConfigItem,
} from "./types.ts";

/**
 * Keeps the named-configs contract on the catch-all overload: with
 * `namedConfigs: true`, every rest config item must carry a `name`.
 *
 * @template O - The literal options type.
 */
type RequireNamedItems<O> = O extends { namedConfigs: true }
	? Array<
			Awaitable<
				Array<NamedFlatConfigItem> | FlatConfigComposer<any, any> | NamedFlatConfigItem
			>
		>
	: unknown;

/** A single accepted rest-argument shape. */
type UserConfigElement = Awaitable<
	Array<TypedFlatConfigItem> | FlatConfigComposer<any, any> | TypedFlatConfigItem
>;

/** The named-configs counterpart of {@linkcode UserConfigElement}. */
type NamedUserConfigElement = Awaitable<
	Array<NamedFlatConfigItem> | FlatConfigComposer<any, any> | NamedFlatConfigItem
>;

/**
 * The contextual anchor for a single rest argument.
 *
 * The anchor has to be a lone object type: a union (or a bare `C`) leaves rule
 * literals with nothing to hover, so array and composer arguments are widened
 * back to the permissive element type and only plain config objects — the case
 * that carries `rules` — get pinned to `Item`.
 *
 * @template T - The inferred type of this argument.
 * @template Element - The permissive fallback for non-object arguments.
 * @template Item - The concrete config-object type to anchor against.
 */
type ContextualItem<T, Element, Item> =
	T extends ReadonlyArray<unknown>
		? { [J in keyof T]: Item }
		: T extends FlatConfigComposer<any, any> | Promise<unknown>
			? Element
			: Item;

/**
 * Restores editor intellisense on the rest arguments.
 *
 * A `const` type parameter suppresses contextual typing, so a bare `C`
 * parameter leaves rule literals with no declaration to hover — no JSDoc, no
 * `@see` link. Mapping over `keyof C` re-supplies a contextual anchor while
 * still inferring `C` literally, which the redundancy check depends on.
 *
 * @template C - The literal user-config tuple.
 * @template Element - The permissive fallback for non-object arguments.
 * @template Item - The concrete config-object type to anchor against.
 */
type ContextualItems<C, Element, Item> = {
	[I in keyof C]: ContextualItem<C[I], Element, Item>;
};

/** The options shape the catch-all overload accepts. */
type CatchAllOptions = Omit<OptionsConfig, "namedConfigs"> &
	TypedFlatConfigItem & { namedConfigs?: boolean };

/**
 * The options argument, anchored to a concrete type so `rules` keeps its
 * intellisense under the `const O` inference.
 *
 * @template O - The literal options type.
 */
type NamedOptionsArgument<O> = NamedOptionsConfig & O & ValidateOptions<O>;

/**
 * The catch-all counterpart of {@linkcode NamedOptionsArgument}.
 *
 * @template O - The literal options type.
 */
type CatchAllOptionsArgument<O> = CatchAllOptions & O & ValidateOptions<O>;

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
 * @template O - The literal options type, used by the redundant-override
 *   check.
 * @template C - The literal user-config tuple, used by the redundant-override
 *   check.
 * @param options - The options for generating the user configuration items.
 * @param userConfigs - Additional user configuration items.
 * @returns A promise that resolves to an array of user configuration items.
 * @rejects Will throw an error if configuration generation fails.
 */
export function isentinel<const O extends NamedOptionsConfig>(
	options: NamedOptionsArgument<O>,
	...userConfigs: Array<Awaitable<FlatConfigComposer<any, any>>>
): Promise<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>;
export function isentinel<
	const O extends NamedOptionsConfig,
	const C extends Array<Awaitable<Array<NamedFlatConfigItem>>>,
>(
	options: NamedOptionsArgument<O>,
	...userConfigs: C &
		ContextualItems<C, NamedUserConfigElement, NamedFlatConfigItem> &
		ValidateUserConfigs<C, O>
): Promise<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>;
export function isentinel<
	const O extends NamedOptionsConfig,
	const C extends Array<Awaitable<NamedFlatConfigItem>>,
>(
	options: NamedOptionsArgument<O>,
	...userConfigs: C &
		ContextualItems<C, NamedUserConfigElement, NamedFlatConfigItem> &
		ValidateUserConfigs<C, O>
): Promise<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>;
/**
 * The catch-all overload stays last: when every overload fails, TypeScript
 * reports the final candidate, so this is the one whose failure carries the
 * RedundantRuleError message — for named-configs callers too, which is why it
 * accepts `namedConfigs: true` and re-imposes the named-item requirement via
 * the conditional rest constraint instead of rejecting named options outright.
 *
 * @template O - The literal options type, used by the redundant-override
 *   check.
 * @template C - The literal user-config tuple, used by the redundant-override
 *   check.
 */
export function isentinel<
	const O extends Omit<OptionsConfig, "namedConfigs"> &
		TypedFlatConfigItem & { namedConfigs?: boolean },
	const C extends Array<
		Awaitable<Array<TypedFlatConfigItem> | FlatConfigComposer<any, any> | TypedFlatConfigItem>
	>,
>(
	options: CatchAllOptionsArgument<O>,
	...userConfigs: C &
		ContextualItems<C, UserConfigElement, TypedFlatConfigItem> &
		RequireNamedItems<O> &
		ValidateUserConfigs<C, O>
): Promise<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>;
export async function isentinel(
	options: OptionsConfig & TypedFlatConfigItem & { namedConfigs?: boolean },
	...userConfigs: Array<
		Awaitable<Array<TypedFlatConfigItem> | FlatConfigComposer<any, any> | TypedFlatConfigItem>
	>
): Promise<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>> {
	const {
		autoRenamePlugins = true,
		componentExts: componentExtensions = [],
		e18e: enableE18e = true,
		eslintPlugin: enableEslintPlugin = false,
		formatters,
		gitignore: enableGitignore = true,
		jsdoc: enableJsdoc = true,
		jsonc: enableJsonc = true,
		jsx: enableJsx = true,
		markdown: enableMarkdown = true,
		oxlint: enableOxlint = false,
		pnpm: enableCatalogs = findUpSync("pnpm-workspace.yaml") !== undefined,
		react: enableReact = false,
		root: customRootGlobs,
		spellCheck: enableSpellCheck,
		toml: enableToml = true,
		yaml: enableYaml = true,
	} = options;

	const rootGlobs = mergeGlobs(GLOB_ROOT, customRootGlobs);
	const enableRoblox = options.roblox !== false;

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

	const oxfmtConfigOptions = formatters !== false ? await resolveOxfmtConfigOptions() : {};

	// Shared with the oxlint factory: these settings feed rule options (for
	// example `flawless/arrow-return-style`'s `maxLen`), so both engines must
	// resolve them identically or their fixes disagree.
	const prettierSettings: PrettierOptions = resolvePrettierSettings(
		formatterOptions.prettierOptions,
	);

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
		comments({ prettierOptions: prettierSettings, stylistic: stylisticOptions }),
		flawless({ stylistic: stylisticOptions }, prettierSettings),
		ignores(options.ignores),
		imports({ stylistic: stylisticOptions, type: projectType }),
		packageJson({ roblox: enableRoblox, stylistic: stylisticOptions, type: projectType }),
		javascript({
			...getOverrides(options, "javascript"),
			...(needsComplementOverlay ? { complementIgnores: robloxScopedFiles } : {}),
			isInEditor,
			roblox: enableRoblox,
			stylistic: stylisticOptions,
		}),
		promise(),
		sonarjs({ isInEditor, roblox: enableRoblox }),
		typescript({
			...resolveSubOptions(options, "typescript"),
			...getOverrides(options, "typescript"),
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
			stylistic: stylisticOptions,
		}),
	);

	if (options.naming !== undefined && options.naming !== false) {
		configs.push(
			naming({
				roblox: enableRoblox,
				...getOverrides(options, "naming"),
				...resolveSubOptions(options, "naming"),
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
		configs.push(node({ ignores: robloxScopedFiles }));
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
					componentExts: componentExtensions,
					stylistic: stylisticOptions,
				},
				shouldFormatLua,
			),
		);
	}

	if (stylisticOptions !== false) {
		configs.push(
			stylistic(stylisticOptions),
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

	if (enableReact !== false) {
		configs.push(
			react({
				...resolveSubOptions(options, "react"),
				...getOverrides(options, "react"),
			}),
		);
	}

	if (enableJsonc !== false && !typeAwareOnly) {
		configs.push(
			jsonc({
				...getOverrides(options, "jsonc"),
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

	configs.push(disables({ root: rootGlobs }));

	// As with spelling above, composed in "only" mode so `oxfmt/oxfmt` resolves
	// in disable comments; the split strips the rule itself.
	if (stylisticOptions !== false) {
		// Oxfmt must be the last config
		configs.push(
			oxfmt({
				componentExts: componentExtensions,
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
				oxfmtOptions: formatterOptions.oxfmtOptions,
				// Native-only hybrid keeps formatting in ESLint: oxfmt runs in
				// oxlint as a jsPlugin, which that mode does not load.
				oxlint: oxlintMode === "full",
				prettierOptions: prettierSettings,
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
			accumulator[key] = options[key] as any;
		}

		return accumulator;
	}, {});
	if (Object.keys(fusedConfig).length) {
		configs.push([fusedConfig]);
	}

	let composer = new FlatConfigComposerClass<TypedFlatConfigItem, ConfigNames>();

	composer = composer.append(...configs, ...(userConfigs as Array<TypedFlatConfigItem>));

	// Markdown uses the `markdown/gfm` language, whose `SourceCode` lacks
	// JS-only methods like `getAllComments`. Without this, any rule override
	// registered without a `files` constraint would apply globally and crash on
	// `.md` files.
	if (options.markdown !== false) {
		composer = composer.setDefaultIgnores((previous) => {
			return [...previous, GLOB_MARKDOWN];
		});
	}

	if (autoRenamePlugins) {
		composer = composer.renamePlugins(defaultPluginRenaming);
	}

	if (oxlintMode !== "off") {
		const tsgolintAvailable = isPackageExists("oxlint-tsgolint");
		if (!tsgolintAvailable) {
			warnMissingTsgolint();
		}

		// Hybrid mode: oxlint owns every rule in the oxlint rule mapping, so
		// drop them from the ESLint configs. Type-aware rules are kept in
		// ESLint when oxlint-tsgolint is absent so they do not vanish entirely.
		composer = composer.onResolved((resolved) => {
			if (options.oxlintWarnDeadRules !== false) {
				warnDeadMappedRules(resolved, oxlintMode);
			}

			dropOxlintCoveredRules(resolved, tsgolintAvailable, oxlintMode);
		});
	}

	if (typeAwareMode !== undefined) {
		composer = composer.onResolved((resolved) => {
			applyTypeAwareSplit(resolved, typeAwareMode, options.typeAwareRules);
		});
	}

	if (isInEditor || inAgentSession) {
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

		if (inAgentSession) {
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
