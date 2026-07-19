import type { ParserOptions } from "@typescript-eslint/parser";

import type { Linter } from "eslint";
import { findUpSync } from "find-up-simple";
import { isPackageExists } from "local-pkg";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import type { FormatConfig, JsdocConfig } from "oxfmt";
import { minVersion } from "semver";

import type { OptionsConfig } from "./eslint/types.ts";
import { GLOB_SRC_EXT } from "./globs.ts";
import type { Awaitable, TypedFlatConfigItem } from "./types.ts";

export type ExtractRuleOptions<T> = T extends Linter.RuleEntry<infer U> ? U : never;

interface DevelopmentEngineRuntime {
	name?: string;
	version?: string;
}

type ModuleImport<T> = Promise<T | { default: T }>;

interface PackageJsonEngines {
	devEngines?: { runtime?: Array<DevelopmentEngineRuntime> | DevelopmentEngineRuntime };
	engines?: { node?: string };
}

type Parser = NonNullable<TypedFlatConfigItem["languageOptions"]>["parser"];

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
	const resolved = await Promise.all(configs.map(async (config) => config));
	return resolved.flat();
}

export function createTsParser({
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
}: {
	componentExtensions?: Array<string>;
	configName: string;
	files: Array<Array<string> | string>;
	ignores?: Array<string>;
	outOfProjectFiles?: Array<string>;
	parser: Parser;
	parserOptions?: ParserOptions;
	parserOptionsNonTypeAware?: ParserOptions;
	parserOptionsTypeAware?: ParserOptions;
	tsconfigPath?: string;
	typeAware: boolean;
}): TypedFlatConfigItem {
	return {
		name: `isentinel/${configName}/${typeAware ? "type-aware-parser" : "parser"}`,
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
 * Finds the Node major version the linted project targets.
 *
 * The shared `settings.n.version` / `settings.node.version` values win, so the
 * setting `eslint-plugin-n` already reads doubles as the override for every
 * version-gated rule in the preset. Failing that, this walks up from `cwd` for
 * the nearest `package.json` that declares a version — leaf manifests in a
 * workspace frequently omit the field and leave it to the root, so a manifest
 * without it is skipped rather than treated as an answer.
 *
 * A range that cannot be parsed resolves to `undefined`, which leaves
 * version-gated rules off rather than enabling them for a runtime that cannot
 * support them.
 *
 * @param settings - Shared ESLint/oxlint settings to read the override from.
 * @param cwd - Directory to start searching from.
 * @returns The targeted Node major, or `undefined` when nothing declares one.
 */
export function resolveNodeMajor(
	settings?: Readonly<Record<string, unknown>>,
	cwd: string = process.cwd(),
): number | undefined {
	const configured = readSettingsNodeVersion(settings);
	if (configured !== undefined) {
		return parseNodeMajor(configured);
	}

	let searchFrom = cwd;

	while (true) {
		const manifestPath = findUpSync("package.json", { cwd: searchFrom });
		if (manifestPath === undefined) {
			return undefined;
		}

		let manifest: PackageJsonEngines = {};
		try {
			manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PackageJsonEngines;
		} catch {
			// An unreadable or malformed manifest tells us nothing; keep walking.
		}

		const range = readNodeRange(manifest);
		if (range !== undefined) {
			return parseNodeMajor(range);
		}

		const parent = path.dirname(path.dirname(manifestPath));
		if (parent === searchFrom) {
			return undefined;
		}

		searchFrom = parent;
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

export function toSourceGlob(glob: string): string {
	return glob.startsWith("!") ? `!${glob.slice(1)}.${GLOB_SRC_EXT}` : `${glob}.${GLOB_SRC_EXT}`;
}

export function getOverrides(
	options: OptionsConfig,
	key: keyof OptionsConfig,
): {
	files?: NonNullable<TypedFlatConfigItem["files"]>;
	filesTypeAware?: NonNullable<TypedFlatConfigItem["files"]>;
	ignoresTypeAware?: NonNullable<TypedFlatConfigItem["ignores"]>;
	overrides: TypedFlatConfigItem["rules"];
	overridesTypeAware: TypedFlatConfigItem["rules"];
} {
	const sub = resolveSubOptions(options, key);

	return {
		files:
			typeof sub === "object" && "files" in sub
				? (sub as { files: TypedFlatConfigItem["files"] }).files
				: undefined,
		filesTypeAware:
			typeof sub === "object" && "filesTypeAware" in sub
				? (sub as { filesTypeAware: TypedFlatConfigItem["files"] }).filesTypeAware
				: undefined,
		ignoresTypeAware:
			typeof sub === "object" && "ignoresTypeAware" in sub
				? (sub as { ignoresTypeAware: TypedFlatConfigItem["ignores"] }).ignoresTypeAware
				: undefined,
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

export function isInGitHooksOrLintStaged(): boolean {
	return [
		process.env["GIT_HOOK"],
		process.env["GIT_PARAMS"],
		process.env["VSCODE_GIT_COMMAND"],
		process.env["npm_lifecycle_script"]?.startsWith("lint-staged"),
	].some(Boolean);
}

export function isInAgentSession(): boolean {
	if (isInGitHooksOrLintStaged()) {
		return false;
	}

	return [
		process.env["CLAUDECODE"],
		process.env["CLAUDE_CODE_ENTRYPOINT"],
		process.env["CODEX_THREAD_ID"],
		process.env["CURSOR_AGENT"],
		process.env["GEMINI_CLI"],
		process.env["OPENCODE"],
	].some(Boolean);
}

export function isInEditorEnvironment(): boolean {
	// Allow explicit override via environment variable
	const explicitValue = process.env["ESLINT_IN_EDITOR"];
	if (explicitValue !== undefined) {
		return explicitValue === "true" || explicitValue === "1";
	}

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

/**
 * Merge custom glob patterns.
 *
 * - Patterns starting with "!" are used to remove matching patterns
 * - Other patterns are added to the result.
 *
 * @example
 *
 * ```ts
 * const result = mergeGlobs(GLOB_ROOT, ["places/**", "!apps/**"]);
 * // Returns: ["*", "packages/**", "libs/**", "places/**"]
 * ```
 *
 * @param globs - The default root glob patterns.
 * @param additionalPatterns - Custom root patterns to merge (optional).
 * @returns The merged array of glob patterns.
 */
export function mergeGlobs(
	globs: Array<string>,
	additionalPatterns?: Array<string>,
): Array<string> {
	if (!additionalPatterns || additionalPatterns.length === 0) {
		return [...globs];
	}

	let result = [...globs];

	for (const pattern of additionalPatterns) {
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

const OXFMT_CONFIG_FILES = [".oxfmtrc.json", ".oxfmtrc.jsonc"];

/**
 * Oxfmt's generated types widen `jsdoc.commentLineStrategy` and
 * `jsdoc.lineWrappingStyle` to `string`, but its JSON schema (and therefore the
 * generated `oxfmt/oxfmt` rule type) keep them as literal enums. Re-narrow them
 * so option objects remain assignable to the rule.
 */
export type OxfmtOptions = Omit<FormatConfig, "jsdoc"> & {
	jsdoc?:
		| boolean
		| (Omit<JsdocConfig, "commentLineStrategy" | "lineWrappingStyle"> & {
				commentLineStrategy?: "keep" | "multiline" | "singleLine";
				lineWrappingStyle?: "balance" | "greedy";
		  });
};

/**
 * Resolve oxfmt configuration from `.oxfmtrc.json` or `.oxfmtrc.jsonc`.
 *
 * @returns The oxfmt configuration options, or an empty object if none found.
 */
export async function resolveOxfmtConfigOptions(): Promise<OxfmtOptions> {
	for (const filename of OXFMT_CONFIG_FILES) {
		const configPath = path.resolve(process.cwd(), filename);
		try {
			const content = await fs.promises.readFile(configPath, "utf-8");
			const { $schema: _, ...config } = JSON.parse(content) as Record<string, unknown>;
			return config;
		} catch {
			continue;
		}
	}

	return {};
}

/**
 * Resolve oxfmt configuration from `.oxfmtrc.json` or `.oxfmtrc.jsonc`,
 * synchronously. Used by the (synchronous) oxlint factory.
 *
 * @returns The oxfmt configuration options, or an empty object if none found.
 */
export function resolveOxfmtConfigOptionsSync(): OxfmtOptions {
	for (const filename of OXFMT_CONFIG_FILES) {
		const configPath = path.resolve(process.cwd(), filename);
		try {
			const content = fs.readFileSync(configPath, "utf-8");
			const { $schema: _, ...config } = JSON.parse(content) as Record<string, unknown>;
			return config;
		} catch {
			continue;
		}
	}

	return {};
}

/**
 * Override the severity of all rules in a rules object, preserving rule
 * options. Rules set to `"off"` are not affected.
 *
 * @param rules - The rules object to override.
 * @param severity - The target severity level.
 * @param excludeRules - Rules to exclude from the severity override.
 * @returns A new rules object with overridden severities.
 */
export function overrideRuleSeverity(
	rules: Record<string, any>,
	severity: "error" | "warn",
	excludeRules: ReadonlySet<string> = new Set(),
): Record<string, any> {
	return Object.fromEntries(
		Object.entries(rules).map(([key, value]) => {
			if (value === "off" || value === 0 || excludeRules.has(key)) {
				return [key, value];
			}

			if (Array.isArray(value)) {
				const [currentSeverity, ...options] = value;
				if (currentSeverity === "off" || currentSeverity === 0) {
					return [key, value];
				}

				return [key, [severity, ...options]];
			}

			if (value === "error" || value === "warn" || value === 1 || value === 2) {
				return [key, severity];
			}

			return [key, value];
		}),
	);
}

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

/**
 * Resolves the lowest Node major version a semver range can match.
 *
 * @param range - A semver range such as `>=24.12.0` or `^24 || ^26`.
 * @returns The lowest major version, or `undefined` for an invalid range.
 */
function parseNodeMajor(range: string): number | undefined {
	try {
		return minVersion(range)?.major;
	} catch {
		return undefined;
	}
}

/**
 * Reads the Node version range from the shared settings, checking both keys
 * `eslint-plugin-n` accepts so a project configuring it for that plugin gets
 * the preset's version-gated rules lined up for free.
 *
 * @param settings - The shared settings object, if any.
 * @returns The configured range, or `undefined` when unset.
 */
function readSettingsNodeVersion(settings?: Readonly<Record<string, unknown>>): string | undefined {
	for (const key of ["n", "node"]) {
		const version = (settings?.[key] as undefined | { version?: unknown })?.version;
		if (typeof version === "string") {
			return version;
		}
	}

	return undefined;
}

/**
 * Reads the declared Node version range from a manifest, preferring
 * `engines.node` and falling back to the `devEngines.runtime` entry named
 * `node`, matching how `eslint-plugin-n` resolves the same question.
 *
 * @param manifest - The parsed manifest.
 * @returns The declared range, or `undefined` when the manifest declares none.
 */
function readNodeRange(manifest: PackageJsonEngines): string | undefined {
	const enginesNode = manifest.engines?.node;
	if (enginesNode !== undefined) {
		return enginesNode;
	}

	const { runtime } = manifest.devEngines ?? {};
	const runtimes = Array.isArray(runtime) ? runtime : [runtime];

	return runtimes.find((entry) => entry?.name === "node")?.version;
}
