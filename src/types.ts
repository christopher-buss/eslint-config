import type { ESLintReactSettings } from "@eslint-react/shared";
import type { StylisticCustomizeOptions } from "@stylistic/eslint-plugin";
import type { ParserOptions } from "@typescript-eslint/parser";

import type { Linter } from "eslint";
import type { FlatGitignoreOptions } from "eslint-config-flat-gitignore";
import type { Options as PrettierOptions } from "prettier";
import type { SetRequired } from "type-fest";

import type { RuleOptions } from "./typegen";
import type { ExtractRuleOptions } from "./utils";

export type Awaitable<T> = Promise<T> | T;

export interface JsdocOptions {
	/**
	 * By default we have different rules enabled for different project types.
	 * This option allows you to enable the package rules regardless of the
	 * project type.
	 */
	full?: boolean;
}

/**
 * A TypedFlatConfigItem that requires a name property. All configs should have
 * a name for better debugging and tooling support.
 */
export type NamedFlatConfigItem = SetRequired<TypedFlatConfigItem, "name">;

/**
 * Options type that requires `name` on the options config and all user configs.
 *
 * @remarks
 * This will become the default in a future major version.
 * @see {@link OptionsConfig.namedConfigs}
 */
export type NamedOptionsConfig = OptionsConfig &
	TypedFlatConfigItem & {
		name: string;
		namedConfigs: true;
	};

export interface OptionsComponentExtensions {
	/** Additional extensions for components. */
	componentExts?: Array<string>;
}

export interface OptionsConfig extends OptionsComponentExtensions, OptionsProjectType {
	/**
	 * Automatically rename plugins in the config.
	 *
	 * @default true
	 */
	autoRenamePlugins?: boolean;

	/**
	 * Enable ESLint plugin development rules.
	 *
	 * @default false
	 * @requires eslint-plugin-eslint-plugin
	 */
	eslintPlugin?: boolean | OptionsOverrides;

	/**
	 * Enable eslint-plugin-flawless.
	 *
	 * @default false
	 */
	flawless?: boolean | OptionsOverridesTypeAware;

	/**
	 * Use external formatters to format files.
	 *
	 * When set to `true`, it will enable all formatters.
	 *
	 * @default true
	 */
	formatters?: boolean | OptionsFormatters;

	/**
	 * Enable gitignore support.
	 *
	 * Passing an object to configure the options.
	 *
	 * @default true
	 * @see https://github.com/antfu/eslint-config-flat-gitignore
	 */
	gitignore?: boolean | FlatGitignoreOptions;

	/**
	 * Extend the global ignores.
	 *
	 * Passing an array to extends the ignores.
	 *
	 * Passing a function to modify the default ignores, or provide custom
	 * ignores.
	 *
	 * @default [ ] - no additional ignores
	 */
	ignores?: ((originals: Array<string>) => Array<string>) | Array<string>;

	/**
	 * Control to disable some rules in editors.
	 *
	 * @default auto-detect based on the process.env
	 */
	isInEditor?: boolean;

	/** Core rules. Can't be disabled. */
	javascript?: OptionsOverrides;

	/**
	 * Enable JSDoc support.
	 *
	 * @default true
	 */
	jsdoc?: boolean | JsdocOptions;

	/**
	 * Enable JSONC support.
	 *
	 * @default true
	 */
	jsonc?: boolean | OptionsOverrides;

	/**
	 * Enable JSX related rules.
	 *
	 * Currently only stylistic rules are included.
	 *
	 * @default true
	 */
	jsx?: boolean;

	/**
	 * Enable linting for **code snippets** in Markdown.
	 *
	 * For formatting Markdown content, enable also `formatters.markdown`.
	 *
	 * @default true
	 */
	markdown?: boolean | OptionsOverrides;

	/**
	 * Require all config items to have a `name` property for better debugging
	 * and tooling support.
	 *
	 * @remarks
	 * This will default to `true` in a future major version and this option
	 * will be removed.
	 * @default false
	 */
	namedConfigs?: boolean;

	/** Supply custom options for eslint-plugin-perfectionist. */
	perfectionist?: PerfectionistConfig;

	/**
	 * Enable pnpm (workspace/catalogs) support.
	 *
	 * Currently it's disabled by default, as it's still experimental. In the
	 * future it will be smartly enabled based on the project usage.
	 *
	 * @default false
	 * @experimental
	 * @see https://github.com/antfu/pnpm-workspace-utils
	 */
	pnpm?: boolean | OptionsPnpm;

	/**
	 * Enable react rules.
	 *
	 * Requires installing:
	 *
	 * - `eslint-plugin-react-x`
	 * - `eslint-plugin-react-hooks`.
	 *
	 * If `stylistic` is enabled, also requires:
	 *
	 * - `eslint-plugin-react-naming-convention`.
	 *
	 * @default false
	 */
	react?: boolean | ReactConfig;

	/**
	 * Enable Roblox linting rules.
	 *
	 * @default true
	 */
	roblox?: boolean | (OptionsFilesTypeAware & OptionsOverridesTypeAware);

	/**
	 * Customize root-level glob patterns.
	 *
	 * These patterns are merged with the default `GLOB_ROOT`. Use "!" prefix to
	 * exclude patterns.
	 *
	 * @example
	 *
	 * ```ts
	 * root: ["places/**", "!apps/**"];
	 * // Results in: ["*", "packages/**", "libs/**", "places/**"]
	 * ```
	 *
	 * @default undefined
	 */
	root?: Array<string>;

	/**
	 * Enable CSpell support.
	 *
	 * @default true
	 */
	spellCheck?: boolean | SpellCheckConfig;

	/**
	 * Enable stylistic rules.
	 *
	 * @default true
	 */
	stylistic?: boolean | StylisticConfig;

	/**
	 * Enable test support.
	 *
	 * Requires installing:
	 *
	 * - 'eslint-plugin-jest' for Jest.
	 * - '@vitest/eslint-plugin' for Vitest.
	 *
	 * @default false
	 */
	test?: boolean | (OptionsOverrides & OptionsTestFramework);

	/**
	 * Enable TOML support.
	 *
	 * @default true
	 */
	toml?: boolean | OptionsOverrides;

	/**
	 * Enable TypeScript support.
	 *
	 * Passing an object to enable TypeScript Language Server support.
	 *
	 * @default auto-detect based on the dependencies
	 */
	typescript?: OptionsTypescript;

	/**
	 * Enable YAML support.
	 *
	 * @default true
	 */
	yaml?: boolean | OptionsOverrides;
}

export interface OptionsFiles {
	/** Override the `files` option to provide custom globs. */
	files?: Array<Array<string> | string>;
}

export interface OptionsFilesTypeAware extends OptionsFiles {
	/**
	 * Override the `filesTypeAware` option to provide custom globs for type
	 * aware files.
	 */
	filesTypeAware?: Array<Array<string> | string>;

	/**
	 * Override the `ignoresTypeAware` option to provide custom globs for type
	 * aware files.
	 */
	ignoresTypeAware?: Array<string>;
}

export interface OptionsFormatters {
	/**
	 * Enable formatting support for CSS, Less, Sass, and SCSS.
	 *
	 * @default true
	 */
	css?: boolean;

	/**
	 * Enable formatting support for GraphQL.
	 *
	 * @default true
	 */
	graphql?: boolean;

	/**
	 * Enable formatting support for HTML.
	 *
	 * @default true
	 */
	html?: boolean;

	/**
	 * Enable formatting support for JSON(C|5).
	 *
	 * @default true
	 */
	json?: boolean;

	/**
	 * Enable formatting support for Lua files (powered by stylua).
	 *
	 * @default true
	 */
	lua?: boolean;

	/**
	 * Enable formatting support for Markdown.
	 *
	 * @default true
	 */
	markdown?: boolean;

	/**
	 * Custom options for Prettier.
	 *
	 * By default it's controlled by our own config.
	 */
	prettierOptions?: PrettierOptions;

	/**
	 * Enable formatting support for YAML.
	 *
	 * @default true
	 */
	yaml?: boolean;
}

export interface OptionsHasRoblox {
	roblox?: boolean;
}

export interface OptionsHasTypeScript {
	typescript?: boolean;
}

export interface OptionsIsInEditor {
	isInEditor?: boolean;
}

export interface OptionsOverrides extends OptionsFiles {
	overrides?: TypedFlatConfigItem["rules"];
}

export interface OptionsOverridesTypeAware extends OptionsOverrides {
	overridesTypeAware?: TypedFlatConfigItem["rules"];
}

export interface OptionsPnpm {
	/** Requires catalogs usage. */
	catalogs?: boolean;
}

export interface OptionsProjectType {
	/**
	 * Type of the project. `package` will enable more strict rules for
	 * packages.
	 *
	 * `app` and `game` are treated the same.
	 *
	 * @default "game"
	 */
	type?: "app" | "game" | "package";
}

export interface OptionsStylistic {
	stylistic?: boolean | StylisticConfig;
}

export interface OptionsTestFramework {
	/** Enable Jest support. */
	jest?: boolean;
	/** Enable Vitest support. */
	vitest?: boolean | OptionsVitest;
}

export type OptionsTypescript =
	| (OptionsOverrides & OptionsTypeScriptErasableOnly & OptionsTypeScriptParserOptions)
	| (OptionsOverrides & OptionsTypeScriptErasableOnly & OptionsTypeScriptWithTypes);

export interface OptionsTypeScriptErasableOnly {
	/**
	 * Enable erasable syntax only rules.
	 *
	 * @default false
	 * @see https://github.com/JoshuaKGoldberg/eslint-plugin-erasable-syntax-only
	 */
	erasableOnly?: boolean;
}

export interface OptionsTypeScriptParserOptions {
	/**
	 * Glob patterns for files that should be type aware.
	 *
	 * @default ["**\/*.{ts,tsx}"]
	 */
	filesTypeAware?: Array<Array<string> | string>;

	/**
	 * Glob patterns for files that should not be type aware. Used to exclude
	 * virtual files created by processors (e.g., markdown TypeScript code
	 * blocks).
	 *
	 * @default ["**\/*.md\/**"]
	 */
	ignoresTypeAware?: Array<string>;

	/**
	 * Globs of files to allow running with the default project compiler options
	 * despite not being matched by the project service.
	 *
	 * @default ["*.js", "*.ts", ".*.js", ".*.ts"]
	 */
	outOfProjectFiles?: Array<string>;

	/** Additional parser options for all TypeScript files. */
	parserOptions?: Partial<ParserOptions>;

	/** Additional parser options for non-type-aware files. */
	parserOptionsNonTypeAware?: Partial<ParserOptions>;

	/** Additional parser options for type-aware files. */
	parserOptionsTypeAware?: Partial<ParserOptions>;
}

export interface OptionsTypeScriptWithTypes {
	/**
	 * Provide a path to the TypeScript configuration file to use a different
	 * default to 'tsconfig.json'.
	 *
	 * @see https://typescript-eslint.io/linting/typed-linting/
	 */
	tsconfigPath?: string;
	/**
	 * Enable Type-Aware linting.
	 *
	 * @default true
	 * @see https://typescript-eslint.io/linting/typed-linting/
	 */
	typeAware?: boolean;
}

export interface OptionsVitest {
	/**
	 * Enable typecheck rules for Vitest.
	 *
	 * @default false
	 * @see https://github.com/vitest-dev/eslint-plugin-vitest#enabling-with-type-testing
	 */
	typecheck?: boolean;
}

export interface PerfectionistConfig {
	customClassGroups?: Array<string>;
	/**
	 * Custom configuration for perfectionist/sort-objects rule. Merges with
	 * default config.
	 */
	sortObjects?: Partial<
		ExtractRuleOptions<NonNullable<RuleOptions["perfectionist/sort-objects"]>>[0]
	>;
	/**
	 * Custom configuration for perfectionist/sort-objects rule in JSX. Merges
	 * with default config.
	 *
	 * Defaults to the same as `sortObjects` if not provided.
	 */
	sortObjectsJsx?: Partial<
		ExtractRuleOptions<NonNullable<RuleOptions["perfectionist/sort-objects"]>>[0]
	>;
}

export type ReactConfig = ESLintReactSettings &
	OptionsOverridesTypeAware & {
		/**
		 * Whether to enable the React Compiler rules.
		 *
		 * These are currently already tuned for roblox-ts projects, but could
		 * be considered unnecessary due to not having the compiler available.
		 *
		 * @default true
		 */
		reactCompiler?: boolean;
	} & {
		filenameCase?: "kebabCase" | "pascalCase";
	};

export type Rules = Record<string, Linter.RuleEntry<any> | undefined> & RuleOptions;

export interface SpellCheckConfig {
	/**
	 * Whether or not to run the spell checker in the editor.
	 *
	 * Some users have performance issues with the spell checker in the editor,
	 * so this option allows you to disable it. It will still run in CI and in
	 * git hooks / pre-commit checks.
	 *
	 * @default true
	 */
	inEditor?: boolean;
	/** Defaults to `en-US`. */
	language?: string;
}

export type StylisticConfig = Pick<
	StylisticCustomizeOptions,
	"indent" | "jsx" | "quotes" | "semi"
> & { arrowLength?: number };

/**
 * An updated version of ESLint's `Linter.Config`, which provides autocompletion
 * for `rules` and relaxes type limitations for `plugins` and `rules`, because
 * many plugins still lack proper type definitions.
 */
export type TypedFlatConfigItem = Omit<Linter.Config<Linter.RulesRecord & Rules>, "plugins"> & {
	/**
	 * An object containing a name-value mapping of plugin names to plugin
	 * objects. When `files` is specified, these plugins are only available to
	 * the matching files.
	 *
	 * @see [Using plugins in your configuration](https://eslint.org/docs/latest/user-guide/configuring/configuration-files-new#using-plugins-in-your-configuration)
	 */
	plugins?: Record<string, any>;

	/**
	 * An object containing the configured rules. When `files` or `ignores` are
	 * specified, these rule configurations are only available to the matching
	 * files.
	 */
	rules?: Rules;
};

export { type ConfigNames } from "./typegen";
export { type FlatConfigComposer } from "eslint-flat-config-utils";
