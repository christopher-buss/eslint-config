// cspell:words CLAUDECODE NVIM
import type { ParserOptions } from "@typescript-eslint/parser";

import type { Linter } from "eslint";
import { findUp, findUpSync } from "find-up-simple";
import { getStaticJSONValue, parseJSON } from "jsonc-eslint-parser";
import { isPackageExists } from "local-pkg";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import type { FormatConfig, JsdocConfig } from "oxfmt";
import { minVersion } from "semver";

import type { TypeAwareSplitMode } from "./eslint/type-aware-split.ts";
import type { OptionsConfig } from "./eslint/types.ts";
import { GLOB_SRC_EXT } from "./globs.ts";
import { isRecord } from "./guards.ts";
import type { Awaitable, TypedFlatConfigItem } from "./types.ts";

export type ExtractRuleOptions<T> = T extends Linter.RuleEntry<infer U> ? U : never;

type AgentMatcher = (environment: NodeJS.ProcessEnv) => boolean;

type AgentCheck = AgentMatcher | string;

type ModuleImport<T> = Promise<T | { default: T }>;

type Parser = NonNullable<TypedFlatConfigItem["languageOptions"]>["parser"];

export const require = createRequire(import.meta.url);

/**
 * Resolves the workspace root directory.
 *
 * The root is the directory containing `pnpm-workspace.yaml`. When no workspace
 * file exists anywhere up the tree the project is standalone, so the cwd is its
 * own root.
 *
 * @param cwd - The directory to resolve from, defaulting to the current
 *   working directory.
 * @returns The absolute path of the workspace root directory.
 */
export async function findWorkspaceRoot(cwd = process.cwd()): Promise<string> {
	const workspaceFile = await findUp("pnpm-workspace.yaml", { cwd });
	return workspaceFile === undefined ? cwd : path.dirname(workspaceFile);
}

/**
 * Synchronous {@link findWorkspaceRoot}, for the oxlint factory.
 *
 * The oxlint factory is synchronous, so it cannot await the async variant.
 *
 * @param cwd - The directory to resolve from, defaulting to the current
 *   working directory.
 * @returns The absolute path of the workspace root directory.
 */
export function findWorkspaceRootSync(cwd = process.cwd()): string {
	const workspaceFile = findUpSync("pnpm-workspace.yaml", { cwd });
	return workspaceFile === undefined ? cwd : path.dirname(workspaceFile);
}

/**
 * Whether the environment signals a CI run. Treats an unset, empty, `"false"`
 * or `"0"` `CI` value as not-CI, so a deliberately falsy `CI=false` is honoured
 * rather than read as truthy.
 *
 * @param environment - The environment variables to inspect.
 * @returns Whether CI is active.
 */
export function isCi(environment: NodeJS.ProcessEnv = process.env): boolean {
	const value = environment["CI"];
	return value !== undefined && value !== "" && value !== "false" && value !== "0";
}

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
	if (isCi() || !process.stdout.isTTY) {
		return;
	}

	const nonExistingPackages = packages.filter(
		(index): index is string => index !== undefined && !isPackageExists(index),
	);
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

		let manifest: Record<string, unknown> = {};
		try {
			const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
			if (isRecord(parsed)) {
				manifest = parsed;
			}
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
	const resolved =
		optionValue === true || optionValue === false || optionValue === undefined
			? {}
			: optionValue;
	// `ResolvedOptions` is a conditional type the compiler cannot derive from the
	// runtime narrowing above; the value is the resolved object either way.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic conditional-type erasure
	return resolved as ResolvedOptions<OptionsConfig[K]>;
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
	if (!isRecord(sub)) {
		return { overrides: {}, overridesTypeAware: {} };
	}

	// `sub` is a resolved sub-option object; its optional fields carry the types
	// declared on the public `OptionsConfig`, which the widened `key` erases.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- typed sub-option fields erased by the generic key
	const shape = sub as {
		files?: NonNullable<TypedFlatConfigItem["files"]>;
		filesTypeAware?: NonNullable<TypedFlatConfigItem["files"]>;
		ignoresTypeAware?: NonNullable<TypedFlatConfigItem["ignores"]>;
		overrides?: NonNullable<TypedFlatConfigItem["rules"]>;
		overridesTypeAware?: NonNullable<TypedFlatConfigItem["rules"]>;
	};

	return {
		files: shape.files,
		filesTypeAware: shape.filesTypeAware,
		ignoresTypeAware: shape.ignoresTypeAware,
		overrides: { ...shape.overrides },
		overridesTypeAware: { ...shape.overridesTypeAware },
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

export function isInGitHooksOrLintStaged(environment: NodeJS.ProcessEnv = process.env): boolean {
	return [
		environment["GIT_HOOK"],
		environment["GIT_PARAMS"],
		environment["VSCODE_GIT_COMMAND"],
		environment["npm_lifecycle_script"]?.startsWith("lint-staged"),
	].some(Boolean);
}

/**
 * Agent probes, mirroring `unjs/std-env`'s `src/agents.ts` (@50dc652) so the
 * two stay diffable. An entry is either an environment variable that is truthy
 * only inside that agent, or a matcher for the agents that hide in a shared
 * variable. Entries run in std-env's order, one agent per line group.
 *
 * `CLAUDE_CODE_ENTRYPOINT` has no std-env counterpart; it predates this port
 * and stays for the Claude Code versions that set only it.
 */
const AGENT_CHECKS: Array<AgentCheck> = [
	// claude
	"CLAUDECODE",
	"CLAUDE_CODE",
	"CLAUDE_CODE_ENTRYPOINT",
	// replit
	"REPL_ID",
	// gemini
	"GEMINI_CLI",
	// codex
	"CODEX_SANDBOX",
	"CODEX_THREAD_ID",
	// opencode
	"OPENCODE",
	// pi
	environmentMatcher("PATH", /\.pi[/\\]agent/),
	// auggie
	"AUGMENT_AGENT",
	// goose
	"GOOSE_PROVIDER",
	// junie
	"JUNIE_DATA",
	"JUNIE_SHIM_PATH",
	// devin
	environmentMatcher("EDITOR", /devin/),
	// cursor
	"CURSOR_AGENT",
	// kiro
	environmentMatcher("TERM_PROGRAM", /kiro/, { noTty: true }),
];

/**
 * Whether the process runs inside an AI coding agent session.
 *
 * `AI_AGENT` forces detection on, matching std-env's explicit override. Git
 * hook and lint-staged runs are excluded even under an agent: those are
 * human-initiated commits whose output a person reads.
 *
 * Not a pure function of `environment` — the kiro check also consults
 * `process.stdout.isTTY` (see {@link environmentMatcher}).
 *
 * @param environment - The environment variables to inspect.
 * @returns Whether an agent session was detected.
 */
export function isInAgentSession(environment: NodeJS.ProcessEnv = process.env): boolean {
	if (isInGitHooksOrLintStaged(environment)) {
		return false;
	}

	if (environment["AI_AGENT"] !== undefined && environment["AI_AGENT"] !== "") {
		return true;
	}

	return AGENT_CHECKS.some((check) => {
		return typeof check === "string" ? Boolean(environment[check]) : check(environment);
	});
}

/**
 * Whether autofixes that rewrite code an agent just wrote should be withheld.
 *
 * Opt-in, and deliberately not tied to {@link isInAgentSession}: merely being
 * an agent is no reason to lint differently — an agent that runs the linter
 * wants the same fixes a human would get. The case this exists for is the
 * wrapper that fixes without anyone reading the diff (an edit hook, a
 * fix-on-save daemon), which knows it is that and can say so.
 *
 * @param environment - The environment variables to inspect.
 * @returns Whether fix suppression was requested.
 */
export function isAgentAutofixDisabled(environment: NodeJS.ProcessEnv = process.env): boolean {
	const value = environment["ESLINT_AGENT_NO_AUTOFIX"];
	return value === "true" || value === "1";
}

export function isInEditorEnvironment(environment: NodeJS.ProcessEnv = process.env): boolean {
	// Allow explicit override via environment variable
	const explicitValue = environment["ESLINT_IN_EDITOR"];
	if (explicitValue !== undefined) {
		return explicitValue === "true" || explicitValue === "1";
	}

	if (isCi(environment)) {
		return false;
	}

	if (isInGitHooksOrLintStaged(environment)) {
		return false;
	}

	return [
		environment["VSCODE_PID"],
		environment["VSCODE_CWD"],
		environment["JETBRAINS_IDE"],
		environment["VIM"],
		environment["NVIM"],
	].some(Boolean);
}

/**
 * Read the `ESLINT_TYPE_AWARE` environment variable so a wrapper CLI can drive
 * the factory's type-aware split without every consumer wiring the `typeAware`
 * option themselves.
 *
 * Recognized values: `off` selects the non-type-aware pass (drop every
 * type-aware rule and the TypeScript program); `only` selects the
 * type-aware-only pass. `false` is a legacy alias for `off` — the canonical
 * vocabulary is `off`/`only`. Any other value, or an unset variable, has no
 * effect.
 *
 * An explicitly passed `typeAware` option always takes precedence: the factory
 * only consults this variable when the option is left `undefined`.
 *
 * @returns The split mode requested by the environment, or `undefined` when the
 *   variable is unset or holds an unrecognized value.
 */
export function typeAwareSplitFromEnvironment(): TypeAwareSplitMode | undefined {
	const value = process.env["ESLINT_TYPE_AWARE"];
	if (value === "off" || value === "false") {
		return false;
	}

	if (value === "only") {
		return "only";
	}

	return undefined;
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

/**
 * Build a probe that regex-tests one environment variable, for the agents that
 * announce themselves inside a variable a human also sets.
 *
 * `noTty` marks a variable an interactive user shares with the agent (kiro's
 * `TERM_PROGRAM` is set in its terminal too): an attached stdout TTY means a
 * person is watching, so the probe declines.
 *
 * @param name - The environment variable to test.
 * @param pattern - The pattern the value must match.
 * @param options - Probe options.
 * @param options.noTty - Whether an attached stdout TTY disqualifies the match.
 * @returns The probe.
 */
function environmentMatcher(
	name: string,
	pattern: RegExp,
	{ noTty = false }: { noTty?: boolean } = {},
): AgentMatcher {
	return (environment) => {
		if (noTty && process.stdout.isTTY) {
			return false;
		}

		const value = environment[name];
		return value !== undefined && pattern.test(value);
	};
}

/** JSON oxfmt config files oxfmt discovers. */
const OXFMT_RC_FILES = [".oxfmtrc.json", ".oxfmtrc.jsonc"];

/**
 * Oxfmt config modules oxfmt discovers. It loads other module extensions only
 * through `--config`, never by search.
 */
export const OXFMT_CONFIG_MODULES = ["oxfmt.config.ts", "oxfmt.config.mts"] as const;

/** The config module the standalone setup writes. */
export const OXFMT_CONFIG_MODULE = OXFMT_CONFIG_MODULES[0];

/** Every file name oxfmt discovers. One directory may hold only one of them. */
const OXFMT_CONFIG_NAMES = [...OXFMT_RC_FILES, ...OXFMT_CONFIG_MODULES];

/** The extensions of the JS/TS files ESLint and oxlint format. */
const SCRIPT_EXTENSIONS = ["cjs", "cts", "js", "jsx", "mjs", "mts", "ts", "tsx"];

/** The extensions of the Markdown files ESLint lints code blocks in. */
const MARKDOWN_EXTENSIONS = ["md"];

/** Set once a process has warned about a JS/TS width override. */
const WARNED_SCRIPT_OVERRIDE = Symbol.for("@isentinel/eslint-config/oxfmt-override-warned");

const GLOB_MAGIC = /[*?[\]{}]/;

/** A found oxfmt config file. */
export interface OxfmtConfigFile {
	/** Whether it is an `oxfmt.config.*` module rather than a JSON rc file. */
	isModule: boolean;
	/** Its absolute path. */
	path: string;
}

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

/** The widths oxfmt formats Markdown files with. */
export interface MarkdownWidths {
	printWidth?: number;
	tabWidth?: number;
}

/** A config override that changes the widths of some Markdown files. */
export interface MarkdownWidthOverride {
	/** The override's globs, relative to the config directory. */
	files: Array<string>;
	widths: MarkdownWidths;
}

/** What the factories read from an oxfmt config. */
export interface ResolvedOxfmtConfig {
	/**
	 * The overrides that change the Markdown widths, in order. Oxfmt formats
	 * Markdown code blocks with these on top of the preset's Markdown options.
	 */
	markdownOverrides?: Array<MarkdownWidthOverride>;
	/** The root format options. */
	options: OxfmtOptions;
}

/**
 * List the oxfmt config files in one directory, without walking up.
 *
 * @param directory - Directory to check.
 * @returns The file names found, sorted.
 */
export function oxfmtConfigNamesIn(directory: string): Array<string> {
	return OXFMT_CONFIG_NAMES.filter((name) => fs.existsSync(path.join(directory, name))).sort();
}

/**
 * Find the oxfmt config the way oxfmt does: walk up from `cwd` to the
 * filesystem root and take the first directory that holds one. Like oxfmt,
 * refuse a directory that holds more than one.
 *
 * @param cwd - Directory to start from.
 * @returns The config file, if any.
 * @throws When one directory holds more than one oxfmt config file.
 */
export function findOxfmtConfig(cwd: string = process.cwd()): OxfmtConfigFile | undefined {
	let directory = path.resolve(cwd);
	for (;;) {
		const [first, second] = oxfmtConfigNamesIn(directory);
		if (second !== undefined) {
			throw new Error(
				`[@isentinel/eslint-config] Both '${first}' and '${second}' found in ${directory}. Keep one oxfmt config file.`,
			);
		}

		if (first !== undefined) {
			return {
				isModule: OXFMT_CONFIG_MODULES.some((name) => name === first),
				path: path.join(directory, first),
			};
		}

		const parent = path.dirname(directory);
		if (parent === directory) {
			return undefined;
		}

		directory = parent;
	}
}

/**
 * Resolve oxfmt format options from the config oxfmt itself would use (see
 * {@link findOxfmtConfig}): `.oxfmtrc.json`, `.oxfmtrc.jsonc`,
 * `oxfmt.config.ts` or `oxfmt.config.mts`.
 *
 * @returns The format options and Markdown widths; empty options if none
 *   found.
 * @rejects When the config is ambiguous or cannot be loaded.
 */
export async function resolveOxfmtConfig(): Promise<ResolvedOxfmtConfig> {
	const config = findOxfmtConfig();
	if (config === undefined) {
		return { options: {} };
	}

	if (!config.isModule) {
		return rcConfig(config.path, await fs.promises.readFile(config.path, "utf-8"));
	}

	let loaded: unknown;
	try {
		const { createJiti } = await import("jiti");
		loaded = await createJiti(import.meta.url, { moduleCache: false }).import(config.path, {
			default: true,
		});
	} catch (err) {
		throw loadError(config.path, err);
	}

	return moduleConfig(config.path, loaded);
}

/**
 * Synchronous {@link resolveOxfmtConfig}, for the (synchronous) oxlint factory.
 * Loads a config module through jiti's synchronous API. Oxlint does not lint
 * Markdown code blocks, so it returns the format options alone.
 *
 * @returns The oxfmt format options, or an empty object if none found.
 * @throws When the config is ambiguous or cannot be loaded.
 */
export function resolveOxfmtConfigOptionsSync(): OxfmtOptions {
	const config = findOxfmtConfig();
	if (config === undefined) {
		return {};
	}

	if (!config.isModule) {
		return rcConfig(config.path, fs.readFileSync(config.path, "utf-8")).options;
	}

	let loaded: unknown;
	try {
		// Loaded on demand: most projects have no config module.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- require() is untyped; this is jiti's own module type.
		const { createJiti } = require("jiti") as typeof import("jiti");
		const module: unknown = createJiti(import.meta.url, { moduleCache: false })(config.path);
		loaded = isRecord(module) && "default" in module ? module["default"] : module;
	} catch (err) {
		throw loadError(config.path, err);
	}

	return moduleConfig(config.path, loaded).options;
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

function loadError(configPath: string, error: unknown): Error {
	return new Error(
		`[@isentinel/eslint-config] Failed to load ${path.basename(configPath)}: ${String(error)}`,
		{ cause: error },
	);
}

/**
 * Whether a glob can match a file with one of `extensions`, judged by the
 * extension of its last segment (`*.ts`, `*.{ts,tsx}`, `*.?ts`, `*`, ...).
 *
 * @param glob - An override `files` glob.
 * @param extensions - The extensions to look for.
 * @returns Whether it can match such a file.
 */
function globMatchesExtension(glob: string, extensions: ReadonlyArray<string>): boolean {
	const base = glob.split("/").at(-1) ?? glob;
	const dot = base.lastIndexOf(".");
	if (dot === -1) {
		return base.includes("*");
	}

	const extension = base.slice(dot + 1);
	if (!GLOB_MAGIC.test(extension)) {
		return extensions.includes(extension);
	}

	return extensions.some((candidate) => path.matchesGlob(candidate, extension));
}

/**
 * Whether an oxfmt override can apply to a file with one of `extensions`.
 *
 * @param override - One entry of the config's `overrides`.
 * @param extensions - The extensions to look for.
 * @returns Whether its `files` can match such a file.
 */
function overrideMatches(
	override: Record<string, unknown>,
	extensions: ReadonlyArray<string>,
): boolean {
	const files: Array<unknown> = Array.isArray(override["files"])
		? override["files"]
		: [override["files"]];
	return files.some((glob) => typeof glob === "string" && globMatchesExtension(glob, extensions));
}

/**
 * Pick `printWidth` and `tabWidth` out of a set of format options.
 *
 * @param options - Format options, of unknown shape.
 * @returns The widths it sets.
 */
function widthsOf(options: unknown): MarkdownWidths {
	if (!isRecord(options)) {
		return {};
	}

	const { printWidth, tabWidth } = options;
	return {
		...(typeof printWidth === "number" ? { printWidth } : {}),
		...(typeof tabWidth === "number" ? { tabWidth } : {}),
	};
}

/**
 * The overrides that set `printWidth` or `tabWidth` for Markdown files.
 *
 * @param overrides - The config's `overrides`.
 * @returns Each such override's globs and widths, in order.
 */
function markdownOverridesOf(overrides: unknown): Array<MarkdownWidthOverride> {
	if (!Array.isArray(overrides)) {
		return [];
	}

	return overrides.flatMap((override: unknown) => {
		if (!isRecord(override) || !overrideMatches(override, MARKDOWN_EXTENSIONS)) {
			return [];
		}

		const widths = widthsOf(override["options"]);
		const files = [override["files"]].flat().filter((glob) => typeof glob === "string");
		return Object.keys(widths).length > 0 ? [{ files, widths }] : [];
	});
}

/**
 * Warn, at most once per process, when an oxfmt override changes `printWidth`
 * or `tabWidth` for JS/TS files: ESLint and oxlint use the root values.
 *
 * @param overrides - The config's `overrides`.
 * @param source - The config file name.
 */
function warnScriptWidthOverrides(overrides: unknown, source: string): void {
	const state: Record<symbol, unknown> = globalThis;
	if (state[WARNED_SCRIPT_OVERRIDE] === true || !Array.isArray(overrides)) {
		return;
	}

	const changesScriptWidth = overrides.some((override: unknown) => {
		if (!isRecord(override) || !isRecord(override["options"])) {
			return false;
		}

		const { printWidth, tabWidth } = override["options"];
		if (printWidth === undefined && tabWidth === undefined) {
			return false;
		}

		return overrideMatches(override, SCRIPT_EXTENSIONS);
	});

	if (changesScriptWidth) {
		state[WARNED_SCRIPT_OVERRIDE] = true;
		console.warn(
			`[@isentinel/eslint-config] ${source} has an override that changes printWidth or tabWidth for JS/TS files. ESLint and oxlint use the root values for those files.`,
		);
	}
}

/**
 * Turn a loaded oxfmt config into `oxfmt/oxfmt` rule options and the Markdown
 * widths. The rule takes format options only, so `$schema`, `ignorePatterns`
 * and `overrides` are dropped from the options.
 *
 * @param config - The loaded config.
 * @param config.$schema - Dropped.
 * @param config.ignorePatterns - Dropped; oxfmt applies them itself.
 * @param config.overrides - Dropped, after the width check; read for the
 *   Markdown widths.
 * @param source - The config file name, for the warning.
 * @returns The format options and Markdown widths.
 */
function toResolvedConfig(
	{
		$schema: _schema,
		ignorePatterns: _ignorePatterns,
		overrides,
		...options
	}: Record<string, unknown>,
	source: string,
): ResolvedOxfmtConfig {
	warnScriptWidthOverrides(overrides, source);
	return { markdownOverrides: markdownOverridesOf(overrides), options };
}

function moduleConfig(configPath: string, loaded: unknown): ResolvedOxfmtConfig {
	if (!isRecord(loaded)) {
		throw loadError(configPath, new TypeError("the default export is not an object"));
	}

	return toResolvedConfig(loaded, path.basename(configPath));
}

function rcConfig(configPath: string, content: string): ResolvedOxfmtConfig {
	let parsed: unknown;
	try {
		parsed = getStaticJSONValue(parseJSON(content, { jsonSyntax: "jsonc" }));
	} catch (err) {
		throw loadError(configPath, err);
	}

	if (!isRecord(parsed)) {
		throw loadError(configPath, new TypeError("the config is not an object"));
	}

	return toResolvedConfig(parsed, path.basename(configPath));
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
		const setting = settings?.[key];
		const version = isRecord(setting) ? setting["version"] : undefined;
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
function readNodeRange({ devEngines, engines }: Record<string, unknown>): string | undefined {
	if (isRecord(engines) && typeof engines["node"] === "string") {
		return engines["node"];
	}

	const runtime = isRecord(devEngines) ? devEngines["runtime"] : undefined;
	const runtimes = Array.isArray(runtime) ? runtime : [runtime];

	const match = runtimes.find(
		(entry): entry is Record<string, unknown> => isRecord(entry) && entry["name"] === "node",
	);
	const version = match?.["version"];
	return typeof version === "string" ? version : undefined;
}
