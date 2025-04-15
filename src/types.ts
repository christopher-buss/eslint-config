import type { ESLintReactSettings } from "@eslint-react/shared";
import type { StylisticCustomizeOptions } from "@stylistic/eslint-plugin";
import type { ParserOptions } from "@typescript-eslint/parser";

import type { Linter } from "eslint";
import type { FlatGitignoreOptions } from "eslint-config-flat-gitignore";
import type { Options as PrettierOptions } from "prettier";

import type { ConfigNames, RuleOptions } from "./typegen";

export type Awaitable<T> = Promise<T> | T;

export interface Rules extends RuleOptions {}

// eslint-disable-next-line unicorn/prefer-export-from -- Required due to build issues
export type { ConfigNames };

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

export interface OptionsFiles {
	/** Override the `files` option to provide custom globs. */
	files?: Array<string>;
}

export type OptionsTypescript =
	| (OptionsOverrides & OptionsTypeScriptParserOptions)
	| (OptionsOverrides & OptionsTypeScriptWithTypes);

export interface OptionsFormatters {
	/**
	 * Enable formatting support for CSS, Less, Sass, and SCSS.
	 *
	 * Currently only support Prettier.
	 */
	css?: "prettier" | boolean;

	/**
	 * Custom options for dprint.
	 *
	 * By default it's controlled by our own config.
	 */
	dprintOptions?: boolean;

	/** Enable formatting support for GraphQL. */
	graphql?: "prettier" | boolean;

	/**
	 * Enable formatting support for HTML.
	 *
	 * Currently only support Prettier.
	 */
	html?: "prettier" | boolean;

	/**
	 * Enable formatting support for Lua files (powered by stylua).
	 *
	 * @default true
	 */
	lua?: boolean;

	/**
	 * Enable formatting support for Markdown.
	 *
	 * Support both Prettier and dprint.
	 *
	 * When set to `true`, it will use Prettier.
	 */
	markdown?: "dprint" | "prettier" | boolean;

	/**
	 * Custom options for Prettier.
	 *
	 * By default it's controlled by our own config.
	 */
	prettierOptions?: PrettierOptions;
}

export interface OptionsComponentExtensions {
	/** Additional extensions for components. */
	componentExts?: Array<string>;
}

export interface OptionsTypeScriptParserOptions {
	/**
	 * Glob patterns for files that should be type aware.
	 *
	 * @default \['**\/*.{ts,tsx}']
	 */
	filesTypeAware?: Array<string>;

	/**
	 * Glob patterns for files that should not be type aware.
	 *
	 * @default \["**\/*.md\/**", "**\/*.astro/*.ts"]
	 */
	ignoresTypeAware?: Array<string>;

	/** Additional parser options for TypeScript. */
	parserOptions?: Partial<ParserOptions>;
}

export interface OptionsTypeScriptWithTypes {
	/**
	 * When this options is provided, type aware rules will be enabled.
	 *
	 * @see https://typescript-eslint.io/linting/typed-linting/
	 */
	tsconfigPath?: Array<string> | string;
}

export interface OptionsHasTypeScript {
	typescript?: boolean;
}

export interface OptionsStylistic {
	stylistic?: boolean | StylisticConfig;
}

export type StylisticConfig = Pick<StylisticCustomizeOptions, "indent" | "jsx" | "quotes" | "semi">;

export interface OptionsProjectType {
	/**
	 * Type of the project. `package` will enable more strict rules for
	 * packages.
	 *
	 * @default "game"
	 */
	type?: "game" | "package";
}

export type ReactConfig = ESLintReactSettings &
	OptionsOverrides & {
		filenameCase?: "kebabCase" | "pascalCase";
	};

export interface PerfectionistConfig {
	customClassGroups?: Array<string>;
}

export interface SpellCheckConfig {
	/** Defaults to `en-US`. */
	language?: string;
}

export interface OptionsOverrides {
	overrides?: TypedFlatConfigItem["rules"];
}

export interface OptionsIsInEditor {
	isInEditor?: boolean;
}

// eslint-disable-next-line unicorn/prevent-abbreviations -- `JsDoc` is a name
export interface JsDocOptions {
	/**
	 * By default we have different rules enabled for different project types.
	 * This option allows you to enable the package rules regardless of the
	 * project type.
	 */
	full?: boolean;
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
	 * - 'eslint-plugin-jest'.
	 *
	 * @default false
	 */
	test?: boolean | OptionsOverrides;

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
