import type { ESLintReactSettings } from "@eslint-react/shared";
import type { ParserOptions } from "@typescript-eslint/parser";

import type { FlatGitignoreOptions } from "eslint-config-flat-gitignore";
import type { SetRequired } from "type-fest";

import type {
	JsdocOptions,
	OptionsFiles,
	OptionsFormatters,
	OptionsOverrides,
	OptionsProjectType,
	OptionsTestFramework,
	RuleOptions,
	StylisticConfig,
	TypedFlatConfigItem,
} from "../types";
import type { ExtractRuleOptions } from "../utils";

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

// Re-export all shared types so ESLint consumers can import from one place
export * from "../types";

/**
 * A TypedFlatConfigItem that requires a name property. All configs should have
 * a name for better debugging and tooling support.
 */
export type NamedFlatConfigItem = SetRequired<TypedFlatConfigItem, "name">;

export interface OptionsComponentExtensions {
	/** Additional extensions for components. */
	componentExts?: Array<string>;
}

export interface OptionsOverridesTypeAware extends OptionsOverrides {
	overridesTypeAware?: TypedFlatConfigItem["rules"];
}

export interface OptionsPnpm {
	/** Requires catalogs usage. */
	catalogs?: boolean;
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

export type OptionsTypescript =
	| (OptionsOverridesTypeAware & OptionsTypeScriptErasableOnly & OptionsTypeScriptParserOptions)
	| (OptionsOverridesTypeAware & OptionsTypeScriptErasableOnly & OptionsTypeScriptWithTypes);

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

export interface OptionsConfig extends OptionsComponentExtensions, OptionsProjectType {
	/**
	 * Automatically rename plugins in the config.
	 *
	 * @default true
	 */
	autoRenamePlugins?: boolean;

	/**
	 * Override the severity level of all rules. Rules that are `"off"` will not
	 * be affected.
	 *
	 * This applies to all configs, including user-defined ones.
	 */
	defaultSeverity?: "error" | "warn";

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

	/**
	 * Disable ESLint rules that are handled by oxlint. Enable this when running
	 * oxlint alongside ESLint to avoid duplicate linting.
	 *
	 * @default false
	 */
	oxlint?: boolean;

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

export type { PrettierOptions } from "./configs/oxfmt";
