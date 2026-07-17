import { FlatConfigComposer as FlatConfigComposerClass } from "eslint-flat-config-utils";
import { findUpSync } from "find-up-simple";
import { isPackageExists } from "local-pkg";

import { GLOB_MARKDOWN, GLOB_ROOT } from "../globs.ts";
import type { RuleOptions } from "../typegen.d.ts";
import {
	getOverrides,
	isInAgentSession,
	isInEditorEnvironment,
	mergeGlobs,
	overrideRuleSeverity,
	resolveOxfmtConfigOptions,
	resolvePrettierConfigOptions,
	resolveSubOptions,
	shouldEnableFeature,
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
import { defaultPluginRenaming } from "./plugin-renaming.ts";
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
 * @template NamedConfigs - When `true`, requires all config items to have a
 *   name.
 * @param options - The options for generating the user configuration items.
 * @param userConfigs - Additional user configuration items.
 * @returns A promise that resolves to an array of user configuration items.
 * @rejects Will throw an error if configuration generation fails.
 */
export function isentinel(
	options: Omit<OptionsConfig, "namedConfigs"> & TypedFlatConfigItem & { namedConfigs?: false },
	...userConfigs: Array<
		Awaitable<Array<TypedFlatConfigItem> | FlatConfigComposer<any, any> | TypedFlatConfigItem>
	>
): Promise<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>;
export function isentinel(
	options: NamedOptionsConfig,
	...userConfigs: Array<Awaitable<FlatConfigComposer<any, any>>>
): Promise<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>;
export function isentinel(
	options: NamedOptionsConfig,
	...userConfigs: Array<Awaitable<Array<NamedFlatConfigItem>>>
): Promise<FlatConfigComposer<TypedFlatConfigItem, ConfigNames>>;
export function isentinel(
	options: NamedOptionsConfig,
	...userConfigs: Array<Awaitable<NamedFlatConfigItem>>
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
		jsx: enableJsx = true,
		oxlint: enableOxlint = false,
		pnpm: enableCatalogs = findUpSync("pnpm-workspace.yaml") !== undefined,
		react: enableReact = false,
		root: customRootGlobs,
		spellCheck: enableSpellCheck,
	} = options;

	const rootGlobs = mergeGlobs(GLOB_ROOT, customRootGlobs);
	const enableRoblox = options.roblox !== false;

	const typeAwareMode: TypeAwareSplitMode | undefined =
		options.typeAware === false || options.typeAware === "only" ? options.typeAware : undefined;
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

	const prettierOptions = formatterOptions.prettierOptions ?? {};
	const editorConfigOptions = await resolvePrettierConfigOptions();
	const oxfmtConfigOptions = formatters !== false ? await resolveOxfmtConfigOptions() : {};

	const prettierSettings: PrettierOptions = Object.assign(
		{
			arrowParens: "always",
			printWidth: 100,
			quoteProps: "consistent",
			semi: true,
			singleQuote: false,
			tabWidth: 4,
			trailingComma: "all",
			useTabs: true,
		} satisfies PrettierOptions,
		editorConfigOptions,
		prettierOptions,
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
		flawless({ stylistic: stylisticOptions }),
		ignores(options.ignores),
		imports({ stylistic: stylisticOptions, type: projectType }),
		packageJson({ roblox: enableRoblox, stylistic: stylisticOptions, type: projectType }),
		javascript({
			...getOverrides(options, "javascript"),
			isInEditor,
			roblox: enableRoblox,
			stylistic: stylisticOptions,
		}),
		promise(),
		sonarjs({ isInEditor }),
		typescript({
			...resolveSubOptions(options, "typescript"),
			...getOverrides(options, "typescript"),
			componentExts: componentExtensions,
			stylistic: stylisticOptions,
		}),
		unicorn({
			...resolveSubOptions(options, "unicorn"),
			roblox: enableRoblox,
			root: rootGlobs,
			stylistic: stylisticOptions,
		}),
	);

	if (options.naming === true) {
		configs.push(
			naming({
				...getOverrides(options, "naming"),
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

	if (enableE18e !== false && !enableRoblox) {
		configs.push(
			e18e({
				isInEditor,
				...(enableE18e === true ? {} : enableE18e),
			}),
		);
	}

	// Enable Node.js rules for non-Roblox packages
	if (projectType === "package" && !enableRoblox) {
		configs.push(node());
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
			stylistic(stylisticOptions, prettierSettings),
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

	if (options.jsonc !== false && !typeAwareOnly) {
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

	if (options.yaml !== false && !typeAwareOnly) {
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

	if (options.toml !== false && !typeAwareOnly) {
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

	if (options.markdown !== false && !typeAwareOnly) {
		configs.push(
			markdown({
				...getOverrides(options, "markdown"),
				componentExts: componentExtensions,
				type: projectType,
			}),
		);
	}

	if (enableSpellCheck !== false && !typeAwareOnly) {
		configs.push(
			spelling({
				...resolveSubOptions(options, "spellCheck"),
				componentExts: componentExtensions,
				isInEditor,
			}),
		);

		if (stylisticOptions !== false && options.yaml !== false) {
			configs.push(sortCspell());
		}
	}

	configs.push(disables({ root: rootGlobs }));

	if (stylisticOptions !== false && !typeAwareOnly) {
		// Oxfmt must be the last config
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
				oxlint: enableOxlint,
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

	if (enableOxlint) {
		const tsgolintAvailable = isPackageExists("oxlint-tsgolint");
		if (!tsgolintAvailable) {
			warnMissingTsgolint();
		}

		// Hybrid mode: oxlint owns every rule in the oxlint rule mapping, so
		// drop them from the ESLint configs. Type-aware rules are kept in
		// ESLint when oxlint-tsgolint is absent so they do not vanish entirely.
		composer = composer.onResolved((resolved) => {
			if (options.oxlintWarnDeadRules !== false) {
				warnDeadMappedRules(resolved);
			}

			dropOxlintCoveredRules(resolved, tsgolintAvailable);
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
