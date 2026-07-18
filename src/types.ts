import type { StylisticCustomizeOptions } from "@stylistic/eslint-plugin";

import type { Linter } from "eslint";
import type { Options as PrettierOptions } from "prettier";

import type { RuleOptions } from "./typegen";
import type { OxfmtOptions } from "./utils.ts";

export type Awaitable<T> = Promise<T> | T;

export interface JsdocOptions {
	/**
	 * By default we have different rules enabled for different project types.
	 * This option allows you to enable the package rules regardless of the
	 * project type.
	 */
	full?: boolean;
}

export type Rules = Record<string, Linter.RuleEntry<any> | undefined> & RuleOptions;

/**
 * An updated version of ESLint's `Linter.Config`, which provides autocompletion
 * for `rules` and relaxes type limitations for `plugins` and `rules`, because
 * many plugins still lack proper type definitions.
 */
export type TypedFlatConfigItem = Omit<Linter.Config<Linter.RulesRecord & Rules>, "plugins"> & {
	/**
	 * The base directory that `files` and `ignores` patterns in this config
	 * object are resolved against. Defaults to the location ESLint derives the
	 * config from. Added in ESLint 9.30.
	 *
	 * @see [basePath](https://eslint.org/docs/latest/use/configure/configuration-files#specifying-basepath)
	 */
	basePath?: string;

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

export interface OptionsComponentExtensions {
	/** Additional extensions for components. */
	componentExts?: Array<string>;
}

export interface OptionsFiles {
	/** Override the `files` option to provide custom globs. */
	files?: Array<Array<string> | string>;
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
	 * Custom options for oxfmt. Takes precedence over options migrated from
	 * prettier.
	 */
	oxfmtOptions?: OxfmtOptions;

	/**
	 * Custom options for Prettier.
	 *
	 * Used for arrow-return-style-x and as a migration source for oxfmt
	 * options.
	 */
	prettierOptions?: PrettierOptions;

	/**
	 * Enable formatting support for YAML.
	 *
	 * @default true
	 */
	yaml?: boolean;
}

export interface OptionsOverrides extends OptionsFiles {
	overrides?: NonNullable<TypedFlatConfigItem["rules"]>;
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

export interface OptionsJest {
	/**
	 * Enable the `eslint-plugin-jest-extended` ruleset.
	 *
	 * Requires `jest-extended` to be installed.
	 *
	 * @default false
	 */
	extended?: boolean;
	/**
	 * Glob patterns for files that should be considered test files for Jest.
	 *
	 * @default ["**\/*.{test,spec}.{ts,tsx,js,jsx}"]
	 */
	files?: Array<Array<string> | string>;
	/**
	 * Glob patterns for test files that the Jest rules should not apply to.
	 *
	 * Excludes matching files from the Jest config only (not globally).
	 */
	ignores?: Array<string>;
	/**
	 * Rule overrides applied to the Jest config only.
	 *
	 * Takes precedence over the shared `test.overrides`.
	 */
	overrides?: NonNullable<TypedFlatConfigItem["rules"]>;
}

export interface OptionsVitest {
	/**
	 * Enable the `eslint-plugin-jest-extended` ruleset.
	 *
	 * Requires `jest-extended` to be installed.
	 *
	 * @default false
	 */
	extended?: boolean;
	/**
	 * Glob patterns for files that should be considered test files for Vitest.
	 *
	 * @default ["**\/*.{test,spec}.{ts,tsx,js,jsx}"]
	 */
	files?: Array<Array<string> | string>;
	/**
	 * Glob patterns for test files that the Vitest rules should not apply to.
	 *
	 * Excludes matching files from the Vitest config only (not globally).
	 */
	ignores?: Array<string>;
	/**
	 * Rule overrides applied to the Vitest config only.
	 *
	 * Takes precedence over the shared `test.overrides`.
	 */
	overrides?: NonNullable<TypedFlatConfigItem["rules"]>;
	/**
	 * Enable typecheck rules for Vitest.
	 *
	 * @default false
	 * @see https://github.com/vitest-dev/eslint-plugin-vitest#enabling-with-type-testing
	 */
	typecheck?: boolean;
}

export interface OptionsTestFramework {
	/** Enable Jest support. */
	jest?: boolean | OptionsJest;
	/** Enable Vitest support. */
	vitest?: boolean | OptionsVitest;
}

export interface OptionsTypeScriptErasableOnly {
	/**
	 * Enable erasable syntax only rules.
	 *
	 * @default false
	 * @see https://github.com/JoshuaKGoldberg/eslint-plugin-erasable-syntax-only
	 */
	erasableOnly?: boolean;
}

export type StylisticConfig = Pick<
	StylisticCustomizeOptions,
	"indent" | "jsx" | "quotes" | "semi"
> & { arrowLength?: number };

export interface OptionsHasRoblox {
	roblox?: boolean;
}

export interface OptionsHasTypeScript {
	typescript?: boolean;
}

export interface OptionsIsInEditor {
	isInEditor?: boolean;
}

export interface OptionsStylistic {
	stylistic?: boolean | StylisticConfig;
}

export type { ConfigNames } from "./typegen";
export { type FlatConfigComposer } from "eslint-flat-config-utils";
