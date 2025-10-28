import type { FlatConfig } from "@eslint/compat";
import type { ParserOptions } from "@typescript-eslint/parser";

import type { Linter } from "eslint";
import { isPackageExists } from "local-pkg";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import prettier from "prettier";

import type { PrettierOptions, PrettierRuleOptions } from "./configs";
import type { Awaitable, OptionsConfig, TypedFlatConfigItem } from "./types";

export type ExtractRuleOptions<T> = T extends Linter.RuleEntry<infer U> ? U : never;

type ModuleImport<T> = Promise<T | { default: T }>;

type Parser = NonNullable<FlatConfig["languageOptions"]>["parser"];

export const require = createRequire(import.meta.url);

export const parserPlain = {
	meta: {
		name: "parser-plain",
	},
	parseForESLint: (code: string) => {
		return {
			ast: {
				body: [],
				comments: [],
				loc: { end: code.length, start: 0 },
				range: [0, code.length],
				tokens: [],
				type: "Program",
			},
			scopeManager: null,
			services: { isPlain: true },
			visitorKeys: {
				Program: [],
			},
		};
	},
};

export type ResolvedOptions<T> = T extends boolean ? never : NonNullable<T>;

/**
 * Combine array and non-array configs into a single array.
 *
 * @param configs - The configs to combine.
 * @returns The combined array.
 */
export async function combine(
	...configs: Array<Awaitable<Array<TypedFlatConfigItem> | TypedFlatConfigItem>>
): Promise<Array<TypedFlatConfigItem>> {
	const resolved = await Promise.all(configs);
	return resolved.flat();
}

export function createTsParser(options: {
	componentExtensions?: Array<string>;
	configName: string;
	files: Array<string>;
	ignores?: Array<string>;
	outOfProjectFiles?: Array<string>;
	parser: Parser;
	parserOptions?: ParserOptions;
	parserOptionsNonTypeAware?: ParserOptions;
	parserOptionsTypeAware?: ParserOptions;
	tsconfigPath?: string;
	typeAware: boolean;
}): TypedFlatConfigItem {
	const {
		componentExtensions = [],
		configName,
		files,
		ignores,
		outOfProjectFiles,
		parser,
		parserOptions = {},
		parserOptionsNonTypeAware = {},
		parserOptionsTypeAware = {},
		tsconfigPath,
		typeAware,
	} = options;

	return {
		files,
		ignores: ignores ?? [],
		languageOptions: {
			parser,
			parserOptions: {
				ecmaVersion: "latest",
				extraFileExtensions: componentExtensions.map((extension) => `.${extension}`),
				sourceType: "module",
				useJSXTextNode: true,
				...(typeAware
					? {
							projectService: {
								allowDefaultProject: outOfProjectFiles ?? [
									"*.js",
									"*.ts",
									".*.js",
									".*.ts",
								],
								defaultProject: tsconfigPath,
							},
							tsconfigRootDir: process.cwd(),
							...parserOptionsTypeAware,
						}
					: {
							program: null,
							project: false,
							projectService: false,
							...parserOptionsNonTypeAware,
						}),
				...parserOptions,
			},
		},
		name: `isentinel/${configName}/${typeAware ? "type-aware-parser" : "parser"}`,
	};
}

export async function ensurePackages(packages: Array<string | undefined>): Promise<void> {
	if ((process.env["CI"] ?? "") || !process.stdout.isTTY) {
		return;
	}

	const nonExistingPackages = packages.filter(
		(index) => index !== undefined && !isPackageExists(index),
	) as Array<string>;
	if (nonExistingPackages.length === 0) {
		return;
	}

	const prompts = await import("@clack/prompts");
	const result = await prompts.confirm({
		message: `${nonExistingPackages.length === 1 ? "Package is" : "Packages are"} required for this config: ${nonExistingPackages.join(", ")}. Do you want to install them?`,
	});
	if (result === true) {
		await import("@antfu/install-pkg").then(async (index) => {
			return index.installPackage(nonExistingPackages, { dev: true });
		});
	}
}

export function getOverrides(
	options: OptionsConfig,
	key: keyof OptionsConfig,
): { overrides: TypedFlatConfigItem["rules"]; overridesTypeAware: TypedFlatConfigItem["rules"] } {
	const sub = resolveSubOptions(options, key);

	return {
		overrides: {
			...(typeof sub === "object" && "overrides" in sub
				? (sub as { overrides: TypedFlatConfigItem["rules"] }).overrides
				: {}),
		},
		overridesTypeAware: {
			...(typeof sub === "object" && "overridesTypeAware" in sub
				? (sub as { overridesTypeAware: TypedFlatConfigItem["rules"] }).overridesTypeAware
				: {}),
		},
	};
}

export function getTsConfig(tsconfigPath?: string): string | undefined {
	if (tsconfigPath !== undefined) {
		return tsconfigPath;
	}

	// Check if tsconfig.json exists in the project root
	const rootTsConfig = path.join(process.cwd(), "tsconfig.json");

	if (fs.existsSync(rootTsConfig)) {
		return rootTsConfig;
	}

	return undefined;
}

export async function interopDefault<T>(dynamicImport: ModuleImport<T>): Promise<T> {
	const resolved = await dynamicImport;
	// Handle both ESM default exports and direct exports
	// Type narrowing for modules with default export
	if (typeof resolved === "object" && resolved !== null && "default" in resolved) {
		return resolved.default;
	}

	return resolved;
}

export function isInEditorEnvironment(): boolean {
	if (process.env["CI"] ?? "") {
		return false;
	}

	if (isInGitHooksOrLintStaged()) {
		return false;
	}

	return [
		process.env["VSCODE_PID"],
		process.env["VSCODE_CWD"],
		process.env["JETBRAINS_IDE"],
		process.env["VIM"],
		process.env["NVIM"],
	].some(Boolean);
}

export function isInGitHooksOrLintStaged(): boolean {
	return [
		process.env["GIT_PARAMS"] ??
			process.env["VSCODE_GIT_COMMAND"] ??
			process.env["npm_lifecycle_script"]?.startsWith("lint-staged"),
	].some(Boolean);
}

export function mergePrettierOptions(
	options: PrettierOptions,
	overrides: PrettierRuleOptions = {},
): Record<string, any> {
	return {
		...options,
		...overrides,
		plugins: [...(overrides.plugins ?? []), ...(options.plugins ?? [])],
	};
}

/**
 * Merge custom root glob patterns with the default GLOB_ROOT.
 *
 * - Patterns starting with "!" are used to remove matching patterns from the
 *   default GLOB_ROOT
 * - Other patterns are added to the result.
 *
 * @example
 *
 * ```ts
 * const result = mergeRootGlobs(GLOB_ROOT, ["places/**", "!apps/**"]);
 * // Returns: ["*", "packages/**", "libs/**", "places/**"]
 * ```
 *
 * @param defaultRoot - The default root glob patterns.
 * @param customRoot - Custom root patterns to merge (optional).
 * @returns The merged array of glob patterns.
 */
export function mergeRootGlobs(
	defaultRoot: Array<string>,
	customRoot?: Array<string>,
): Array<string> {
	if (!customRoot || customRoot.length === 0) {
		return [...defaultRoot];
	}

	let result = [...defaultRoot];

	for (const pattern of customRoot) {
		if (pattern.startsWith("!")) {
			const patternToRemove = pattern.slice(1);
			result = result.filter((item) => item !== patternToRemove);
		} else {
			result.push(pattern);
		}
	}

	return result;
}

/**
 * Rename plugin names a flat configs array.
 *
 * @example
 *
 * ```ts
 * import { renamePluginInConfigs } from "@antfu/eslint-config";
 * import someConfigs from "./some-configs";
 *
 * export default renamePluginInConfigs(someConfigs, {
 * 	"@typescript-eslint": "ts",
 * 	"import-x": "import",
 * });
 * ```
 *
 * @param configs - The configs array to rename.
 * @param map - A map of prefixes to rename.
 * @returns The renamed configs array.
 */
export function renamePluginInConfigs(
	configs: Array<TypedFlatConfigItem>,
	map: Record<string, string>,
): Array<TypedFlatConfigItem> {
	return configs.map((index) => {
		const clone = { ...index };
		if (clone.rules) {
			clone.rules = renameRules(clone.rules, map);
		}

		if (clone.plugins) {
			clone.plugins = Object.fromEntries(
				Object.entries(clone.plugins).map(([key, value]) => {
					if (key in map) {
						return [map[key], value];
					}

					return [key, value];
				}),
			);
		}

		return clone;
	});
}

/**
 * Rename plugin prefixes in a rule object. Accepts a map of prefixes to rename.
 *
 * @example
 *
 * ```ts
 * import { renameRules } from "@antfu/eslint-config";
 *
 * export default [
 * 	{
 * 		rules: renameRules(
 * 			{
 * 				"@typescript-eslint/indent": "error",
 * 			},
 * 			{ "@typescript-eslint": "ts" },
 * 		),
 * 	},
 * ];
 * ```
 *
 * @param rules - The rules object to rename.
 * @param map - A map of prefixes to rename.
 * @returns The renamed rules object.
 */
export function renameRules(
	rules: Record<string, any>,
	map: Record<string, string>,
): Record<string, any> {
	return Object.fromEntries(
		Object.entries(rules).map(([key, value]) => {
			for (const [from, to] of Object.entries(map)) {
				if (key.startsWith(`${from}/`)) {
					return [to + key.slice(from.length), value];
				}
			}

			return [key, value];
		}),
	);
}

/**
 * Resolve Prettier configuration options for the project.
 *
 * @returns The Prettier configuration options, or an empty object if none
 *   found.
 */
export async function resolvePrettierConfigOptions(): Promise<PrettierOptions> {
	try {
		// Use package.json as file path since it exists in all projects and
		// allows prettier to resolve project-wide configuration (prettierrc,
		// EditorConfig, etc.)
		const config = await prettier.resolveConfig("package.json", {
			editorconfig: true,
		});
		return config ?? {};
	} catch {
		return {};
	}
}

export function resolveSubOptions<K extends keyof OptionsConfig>(
	options: OptionsConfig,
	key: K,
): ResolvedOptions<OptionsConfig[K]> {
	const optionValue = options[key];
	const defaults = resolveWithDefaults(
		optionValue as boolean | OptionsConfig[K] | undefined,
		{} as OptionsConfig[K],
	);
	return (defaults === false ? {} : defaults) as ResolvedOptions<OptionsConfig[K]>;
}

/**
 * Resolve options with default values. Handles the pattern where `true` means
 * "use defaults", `false` disables the feature, and objects are used as-is.
 *
 * @template T - The type of the defaults object.
 * @param value - The option value (true | false | undefined | object).
 * @param defaults - Default values to use when value is true or undefined.
 * @returns The resolved options.
 */
export function resolveWithDefaults<T>(value: boolean | T | undefined, defaults: T): false | T {
	if (value === false) {
		return false;
	}

	if (value === true || value === undefined) {
		return defaults;
	}

	return value;
}

/**
 * Check if a feature should be enabled based on options. Handles the pattern
 * where features can be disabled globally or individually.
 *
 * @template T - The type of the options object.
 * @template K - The key type within the options object.
 * @param options - The options object (true | false | undefined | object).
 * @param key - The key to check within the options object.
 * @param defaultValue - Default value when key is not specified.
 * @returns Whether the feature should be enabled.
 */
export function shouldEnableFeature<T extends Record<string, any>>(
	options: boolean | T | undefined,
	key: keyof T,
	defaultValue = true,
): boolean {
	if (options === false) {
		return false;
	}

	if (options === true || options === undefined) {
		return defaultValue;
	}

	return options[key] !== false;
}
