import type { StylisticCustomizeOptions } from "@stylistic/eslint-plugin";

import type { Linter } from "eslint";
import type { FormatOptions as OxfmtOptions } from "oxfmt";
import type { OxlintOverride } from "oxlint";
import type { Options as PrettierOptions } from "prettier";

import type { RuleOptions } from "./typegen";

export type { RuleOptions } from "./typegen";

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

export type TypedOxlintConfigItem = Omit<OxlintOverride, "rules"> & {
	/** A name for this config item, for better debugging and tooling support. */
	name: string;

	/**
	 * An object containing the configured rules. When `files` or `ignores` are
	 * specified, these rule configurations are only available to the matching
	 * files.
	 */
	rules?: Rules;
};

export interface OptionsFiles {
	/** Override the `files` option to provide custom globs. */
	files?: Array<Array<string> | string>;
}

export interface OptionsOverrides extends OptionsFiles {
	overrides?: TypedFlatConfigItem["rules"];
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

export interface OptionsTestFramework {
	/** Enable Jest support. */
	jest?: boolean | OptionsJest;
	/** Enable Vitest support. */
	vitest?: boolean | OptionsVitest;
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

export type StylisticConfig = Pick<
	StylisticCustomizeOptions,
	"indent" | "jsx" | "quotes" | "semi"
> & { arrowLength?: number };

export interface OptionsStylistic {
	stylistic?: boolean | StylisticConfig;
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

export { type ConfigNames } from "./typegen";
export { type FlatConfigComposer } from "eslint-flat-config-utils";

export { type FormatOptions as OxfmtOptions } from "oxfmt";
export { type Options as PrettierOptions } from "prettier";
