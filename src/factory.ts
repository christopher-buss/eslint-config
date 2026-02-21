import { FlatConfigComposer as FlatConfigComposerClass } from "eslint-flat-config-utils";
import { findUpSync } from "find-up-simple";

import type { PrettierOptions } from "./configs";
import {
	ceaseNonsense,
	comments,
	disables,
	eslintPlugin,
	flawless,
	gitignore,
	ignores,
	imports,
	javascript,
	jsdoc,
	jsonc,
	markdown,
	node,
	oxfmt,
	perfectionist,
	pnpm,
	prettier,
	promise,
	react,
	roblox,
	sonarjs,
	sortGithubAction,
	sortPnpmWorkspace,
	sortRojoProject,
	sortTsconfig,
	stylistic,
	test,
	toml,
	typescript,
	unicorn,
	yaml,
} from "./configs";
import { jsx } from "./configs/jsx";
import { packageJson } from "./configs/package-json";
import { spelling } from "./configs/spelling";
import { GLOB_ROOT } from "./globs";
import type {
	Awaitable,
	ConfigNames,
	FlatConfigComposer,
	NamedFlatConfigItem,
	NamedOptionsConfig,
	OptionsConfig,
	TypedFlatConfigItem,
} from "./types";
import {
	getOverrides,
	isInAgentSession,
	isInEditorEnvironment,
	mergeGlobs,
	overrideRuleSeverity,
	require,
	resolveOxfmtConfigOptions,
	resolvePrettierConfigOptions,
	resolveSubOptions,
	resolveWithDefaults,
	shouldEnableFeature,
} from "./utils";

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

export const defaultPluginRenaming = {
	"@eslint-react": "react",
	"@eslint-react/hooks-extra": "react-hooks-extra",
	"@eslint-react/naming-convention": "react-naming-convention",
	"@isentinel/eslint-plugin-comment-length": "comment-length",
	"@stylistic": "style",
	"@typescript-eslint": "ts",
	"arrow-return-style-x": "arrow-style",
	"n": "node",
	"yml": "yaml",
};

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
		eslintPlugin: enableEslintPlugin = false,
		formatters,
		gitignore: enableGitignore = true,
		jsdoc: enableJsdoc = true,
		jsx: enableJsx = true,
		pnpm: enableCatalogs = findUpSync("pnpm-workspace.yaml") !== undefined,
		react: enableReact = false,
		root: customRootGlobs,
		spellCheck: enableSpellCheck,
		typescript: enableTypeScript,
	} = options;

	const rootGlobs = mergeGlobs(GLOB_ROOT, customRootGlobs);
	const enableRoblox = options.roblox !== false;

	let { defaultSeverity, isInEditor } = options;
	if (defaultSeverity === undefined && isInAgentSession()) {
		defaultSeverity = "error";
	}

	if (isInEditor === undefined) {
		isInEditor = isInEditorEnvironment();
		if (isInEditor) {
			// eslint-disable-next-line no-console -- Info for plugin
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

	const formatterOptions = typeof options.formatters === "object" ? options.formatters : {};
	const jsFormatter = formatterOptions.javascript ?? "oxfmt";
	const tsFormatter = formatterOptions.typescript ?? "oxfmt";
	const useOxfmt =
		options.formatters !== false && (jsFormatter === "oxfmt" || tsFormatter === "oxfmt");

	const prettierOptions = formatterOptions.prettierOptions ?? {};
	const editorConfigOptions = await resolvePrettierConfigOptions();
	const oxfmtConfigOptions = useOxfmt ? await resolveOxfmtConfigOptions() : {};

	const prettierSettings: PrettierOptions = Object.assign(
		{
			arrowParens: "always",
			jsdocPreferCodeFences: true,
			jsdocPrintWidth: 80,
			plugins: [require.resolve("prettier-plugin-jsdoc")],
			printWidth: 100,
			quoteProps: "consistent",
			semi: true,
			singleQuote: false,
			tabWidth: 4,
			trailingComma: "all",
			tsdoc: true,
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
		ceaseNonsense({ isInEditor, stylistic: stylisticOptions }),
		comments({ prettierOptions: prettierSettings, stylistic: stylisticOptions }),
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
		unicorn({ root: rootGlobs, stylistic: stylisticOptions }),
	);

	if (options.flawless === true) {
		configs.push(
			flawless({
				...getOverrides(options, "flawless"),
			}),
		);
	}

	if (enableJsdoc !== false) {
		configs.push(jsdoc({ stylistic: stylisticOptions, type: projectType }));
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
		const shouldFormatLua = shouldEnableFeature(formatters, "lua");
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

	if (options.jsonc !== false) {
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

	if (options.yaml !== false) {
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

	if (enableCatalogs !== false) {
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

	if (options.toml !== false) {
		configs.push(
			toml({
				...getOverrides(options, "toml"),
				stylistic: stylisticOptions,
			}),
		);
	}

	if (options.markdown !== false) {
		configs.push(
			markdown({
				...getOverrides(options, "markdown"),
				componentExts: componentExtensions,
				type: projectType,
			}),
		);
	}

	if (enableSpellCheck !== false) {
		configs.push(
			spelling({
				...resolveSubOptions(options, "spellCheck"),
				componentExts: componentExtensions,
				isInEditor,
			}),
		);
	}

	configs.push(disables({ root: rootGlobs }));

	if (stylisticOptions !== false) {
		// We require prettier to be the last config
		configs.push(
			prettier({
				...resolveWithDefaults(enableTypeScript, {}),
				...getOverrides(options, "typescript"),
				componentExts: componentExtensions,
				formatters: formatters !== false ? formatters : undefined,
				jsFormatter,
				prettierOptions: prettierSettings,
				stylistic: stylisticOptions,
				tsFormatter,
			}),
		);

		if (useOxfmt) {
			configs.push(
				oxfmt({
					componentExts: componentExtensions,
					jsFormatter,
					oxfmtConfigOptions,
					oxfmtOptions: formatterOptions.oxfmtOptions,
					prettierOptions: prettierSettings,
					tsFormatter,
				}),
			);
		}
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

	if (autoRenamePlugins) {
		composer = composer.renamePlugins(defaultPluginRenaming);
	}

	if (isInEditor) {
		const disableAutofixRules = [
			"no-useless-return",
			"prefer-const",
			"unused-imports/no-unused-imports",
		];
		if (enableRoblox) {
			disableAutofixRules.push("unicorn/no-array-for-each");
		}

		composer = composer.disableRulesFix(disableAutofixRules, {
			builtinRules: async () => {
				const rules = await import("eslint/use-at-your-own-risk");
				return rules.builtinRules;
			},
		});
	}

	if (defaultSeverity) {
		composer = composer.onResolved((item) => {
			for (const config of item) {
				if (config.rules) {
					config.rules = overrideRuleSeverity(config.rules, defaultSeverity);
				}
			}
		});
	}

	return composer;
}
