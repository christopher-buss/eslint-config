import type { ESLintReactSettings } from "@eslint-react/shared";
import type { StylisticCustomizeOptions } from "@stylistic/eslint-plugin";
import type { ParserOptions } from "@typescript-eslint/parser";

import type { Linter } from "eslint";
import type { FlatGitignoreOptions } from "eslint-config-flat-gitignore";
import type { Options as PrettierOptions } from "prettier";

import type { ConfigNames, RuleOptions } from "./typegen";

export type Awaitable<T> = Promise<T> | T;

// eslint-disable-next-line unicorn/prevent-abbreviations -- `JsDoc` is a name
export interface JsDocOptions {
	/**
	 * By default we have different rules enabled for different project types.
	 * This option allows you to enable the package rules regardless of the
	 * project type.
	 */
	full?: boolean;
}

// eslint-disable-next-line unicorn/prefer-export-from -- Required due to build issues
export type { ConfigNames };

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
	 * Control to disable some rules in editors.
	 *
	 * @default auto-detect based on the process.env
	 */
	isInEditor?: boolean;

	/**
	 * Enable JSDoc support.
	 *
	 * @default true
	 */
	jsdoc?: boolean | JsDocOptions;

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
	pnpm?: boolean;

	/**
	 * Enable react rules.
	 *
	 * Requires installing:
	 *
	 * - `@eslint-react/eslint-plugin`
	 * - `eslint-plugin-react-roblox-hooks`.
	 *
	 * @default false
	 */
	react?: boolean | ReactConfig;

	/**
	 * Enable Roblox-TS support.
	 *
	 * @ignore
	 * @note This is only required as we are linting this
	 * project with its own rule-set, despite not being a roblox project.
	 */
	roblox?: boolean;

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
	files?: Array<string>;
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

export interface OptionsHasTypeScript {
	typescript?: boolean;
}

export interface OptionsIsInEditor {
	isInEditor?: boolean;
}

export interface OptionsOverrides {
	overrides?: TypedFlatConfigItem["rules"];
}

export interface OptionsProjectType {
	/**
	 * Type of the project. `package` will enable more strict rules for
	 * packages.
	 *
	 * @default "game"
	 */
	type?: "game" | "package";
}

export interface OptionsRoblox {
	/** Enable or disable Roblox-specific rules. */
	roblox?: boolean;
}

export interface OptionsStylistic {
	stylistic?: boolean | StylisticConfig;
}

export interface OptionsTestFramework {
	/** Enable Jest support. */
	jest?: boolean;
	/** Enable Vitest support. */
	vitest?: boolean;
}

export type OptionsTypescript =
	| (OptionsOverrides & OptionsTypeScriptParserOptions)
	| (OptionsOverrides & OptionsTypeScriptWithTypes);

export interface OptionsTypeScriptParserOptions {
	/**
	 * Glob patterns for files that should be type aware.
	 *
	 * @default \['**\/*.{ts,tsx}']
	 */
	filesTypeAware?: Array<string>;

	/**
	 * Glob patterns for files that should not be type aware. Used to exclude
	 * virtual files created by processors (e.g., markdown TypeScript code
	 * blocks).
	 *
	 * @default \["**\/*.md\/**.*"]
	 */
	ignoresTypeAware?: Array<string>;

	/** Additional parser options for TypeScript. */
	parserOptions?: Partial<ParserOptions>;
}

export interface OptionsTypeScriptWithTypes {
	/** Override type aware rules. */
	overridesTypeAware?: TypedFlatConfigItem["rules"];
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

export interface PerfectionistConfig {
	customClassGroups?: Array<string>;
}

export type ReactConfig = ESLintReactSettings &
	OptionsOverrides & {
		filenameCase?: "kebabCase" | "pascalCase";
	};

export interface Rules extends RuleOptions {}

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

export type TypedFlatConfigItem = Omit<Linter.Config<Linter.RulesRecord & Rules>, "plugins"> & {
	// Relax plugins type limitation, as most of the plugins did not have correct
	// type info yet.
	/**
	 * An object containing a name-value mapping of plugin names to plugin
	 * objects. When `files` is specified, these plugins are only available to
	 * the matching files.
	 *
	 * @see [Using plugins in your configuration](https://eslint.org/docs/latest/user-guide/configuring/configuration-files-new#using-plugins-in-your-configuration)
	 */
	plugins?: Record<string, any>;
};
