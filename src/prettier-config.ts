/**
 * Synchronous resolution of the effective Prettier-shaped formatting settings
 * (`printWidth`, `tabWidth`, `useTabs`, ...) shared by both factories.
 *
 * These settings do not only drive formatting: `printWidth` and `tabWidth`
 * feed rule options such as `flawless/arrow-return-style`'s `maxLen`,
 * `tabWidth` and `useOxfmt.printWidth`. The ESLint and oxlint factories must
 * therefore resolve them identically, or the same rule reaches opposite
 * conclusions in each engine and `--fix` ping-pongs the code between both
 * forms.
 *
 * Prettier's own `resolveConfig` is async-only since v3, and the oxlint
 * factory is synchronous, so resolution is reimplemented here against the
 * config formats that can be read synchronously. TypeScript config files
 * (`prettier.config.ts` and friends) need a loader and are skipped.
 */

import { getStaticJSONValue, parseJSON } from "jsonc-eslint-parser";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import type { Options as PrettierOptions } from "prettier";
import { getStaticYAMLValue, parseYAML } from "yaml-eslint-parser";

/** Preset defaults, overridden by any project-level configuration. */
export const PRETTIER_DEFAULTS = {
	arrowParens: "always",
	printWidth: 100,
	quoteProps: "consistent",
	semi: true,
	singleQuote: false,
	tabWidth: 4,
	trailingComma: "all",
	useTabs: true,
} as const satisfies PrettierOptions;

/**
 * Config file names searched in each directory, in Prettier's own precedence
 * order. `package.json` is handled separately (it only counts when it carries
 * a `prettier` key).
 */
const CONFIG_FILES = [
	".prettierrc",
	".prettierrc.json",
	".prettierrc.jsonc",
	".prettierrc.json5",
	".prettierrc.yaml",
	".prettierrc.yml",
	".prettierrc.js",
	".prettierrc.cjs",
	".prettierrc.mjs",
	"prettier.config.js",
	"prettier.config.cjs",
	"prettier.config.mjs",
] as const;

/**
 * EditorConfig section matched against a representative source file rather
 * than `package.json`: the settings feed JS/TS rule options, so per-extension
 * sections must resolve the way they do for the files those rules lint.
 */
const EDITORCONFIG_PROBE_FILE = "index.ts";

const LINE_BREAK = /\r?\n/;
const LEADING_SLASH = /^\//;
const REGEXP_SPECIAL = /[$()*+.?[\\\]^{|}]/g;
/**
 * Glob constructs expanded by {@link expandGlobToken}; anything else is
 * escaped.
 */
const GLOB_TOKEN = /\*\*\/?|\{[^{}]*\}|[$()*+.?[\\\]^{|}]/g;

interface EditorConfigSection {
	pattern: string;
	properties: Record<string, string>;
}

interface ParsedEditorConfig {
	isRoot: boolean;
	sections: Array<EditorConfigSection>;
}

/**
 * Resolve the project's Prettier configuration, EditorConfig included, without
 * awaiting.
 *
 * @param cwd - Directory to start the upward search from.
 * @returns The resolved options, or an empty object when none are found.
 */
export function resolveProjectPrettierConfig(cwd: string = process.cwd()): PrettierOptions {
	return {
		...resolveEditorConfigOptions(cwd),
		...resolvePrettierRcOptions(cwd),
	};
}

/**
 * Resolve the effective formatting settings: preset defaults, overridden by
 * the project's EditorConfig and Prettier configuration, overridden by the
 * options passed to the factory.
 *
 * @param prettierOptions - Explicit `formatters.prettierOptions`.
 * @param cwd - Directory to resolve project configuration from.
 * @returns The merged settings.
 */
export function resolvePrettierSettings(
	prettierOptions: PrettierOptions = {},
	cwd: string = process.cwd(),
): PrettierOptions {
	return {
		...PRETTIER_DEFAULTS,
		...resolveProjectPrettierConfig(cwd),
		...prettierOptions,
	};
}

function readFileOrUndefined(filePath: string): string | undefined {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return undefined;
	}
}

function parseJsonLike(contents: string): unknown {
	try {
		return getStaticJSONValue(parseJSON(contents, { jsonSyntax: "json5" }));
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPackageJsonPrettierKey(filePath: string): PrettierOptions | undefined {
	const contents = readFileOrUndefined(filePath);
	if (contents === undefined) {
		return undefined;
	}

	const parsed = parseJsonLike(contents);
	const prettierKey = isRecord(parsed) ? parsed["prettier"] : undefined;
	// A string value points at a shareable config, which needs module
	// resolution Prettier performs itself; treat it as absent.
	return isRecord(prettierKey) ? prettierKey : undefined;
}

/**
 * Load a JS Prettier config. Node's `require` handles ESM entry points
 * synchronously on the versions this package supports, so both module systems
 * work; a config that cannot be loaded is treated as absent rather than fatal.
 *
 * @param filePath - Absolute path of the config module.
 * @returns The exported options, or `undefined`.
 */
function requireConfigModule(filePath: string): PrettierOptions | undefined {
	try {
		const require = createRequire(filePath);
		const loaded: unknown = require(filePath);
		const value = isRecord(loaded) && "default" in loaded ? loaded["default"] : loaded;
		return isRecord(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

function parseYamlLike(contents: string): unknown {
	try {
		return getStaticYAMLValue(parseYAML(contents));
	} catch {
		return undefined;
	}
}

function readConfigFile(filePath: string): PrettierOptions | undefined {
	const extension = path.extname(filePath);
	if (extension === ".js" || extension === ".cjs" || extension === ".mjs") {
		return fs.existsSync(filePath) ? requireConfigModule(filePath) : undefined;
	}

	const contents = readFileOrUndefined(filePath);
	if (contents === undefined) {
		return undefined;
	}

	// `.prettierrc` accepts both JSON and YAML; YAML is a superset in practice,
	// but JSON(C) is tried first so trailing commas and comments still parse.
	const parsed = parseJsonLike(contents) ?? parseYamlLike(contents);
	return isRecord(parsed) ? parsed : undefined;
}

function ancestorDirectories(cwd: string): Array<string> {
	const directories: Array<string> = [];
	let current = path.resolve(cwd);

	while (true) {
		directories.push(current);
		const parent = path.dirname(current);
		if (parent === current) {
			return directories;
		}

		current = parent;
	}
}

/**
 * Walk up from `cwd` looking for a Prettier configuration file.
 *
 * @param cwd - Directory to start the upward search from.
 * @returns The first configuration found, or an empty object.
 */
function resolvePrettierRcOptions(cwd: string): PrettierOptions {
	for (const directory of ancestorDirectories(cwd)) {
		const fromPackageJson = readPackageJsonPrettierKey(path.join(directory, "package.json"));
		if (fromPackageJson !== undefined) {
			return fromPackageJson;
		}

		for (const filename of CONFIG_FILES) {
			const config = readConfigFile(path.join(directory, filename));
			if (config !== undefined) {
				return config;
			}
		}
	}

	return {};
}

function editorConfigToPrettier(properties: Record<string, string>): PrettierOptions {
	const options: PrettierOptions = {};

	const indentStyle = properties["indent_style"];
	if (indentStyle === "tab" || indentStyle === "space") {
		options.useTabs = indentStyle === "tab";
	}

	// `indent_size = tab` defers to `tab_width`, matching EditorConfig itself.
	const indentSize = properties["indent_size"];
	const width =
		indentSize === undefined || indentSize === "tab" ? properties["tab_width"] : indentSize;
	const tabWidth = Number.parseInt(width ?? "", 10);
	if (Number.isFinite(tabWidth)) {
		options.tabWidth = tabWidth;
	}

	const printWidth = Number.parseInt(properties["max_line_length"] ?? "", 10);
	if (Number.isFinite(printWidth)) {
		options.printWidth = printWidth;
	}

	const endOfLine = properties["end_of_line"];
	if (endOfLine === "cr" || endOfLine === "crlf" || endOfLine === "lf") {
		options.endOfLine = endOfLine;
	}

	return options;
}

function parseEditorConfig(contents: string): ParsedEditorConfig {
	const sections: Array<EditorConfigSection> = [];
	let current: EditorConfigSection | undefined;
	let isRoot = false;

	for (const rawLine of contents.split(LINE_BREAK)) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#") || line.startsWith(";")) {
			continue;
		}

		if (line.startsWith("[") && line.endsWith("]")) {
			current = { pattern: line.slice(1, -1), properties: {} };
			sections.push(current);
			continue;
		}

		const separator = line.indexOf("=");
		if (separator === -1) {
			continue;
		}

		const key = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();

		if (current === undefined) {
			isRoot ||= key === "root" && value.toLowerCase() === "true";
			continue;
		}

		current.properties[key] = value;
	}

	return { isRoot, sections };
}

function escapeRegExp(value: string): string {
	return value.replaceAll(REGEXP_SPECIAL, (character) => `\\${character}`);
}

/**
 * Expand one glob token into its regular-expression equivalent.
 *
 * @param token - A token matched by {@link GLOB_TOKEN}.
 * @returns The regular-expression source for the token.
 */
function expandGlobToken(token: string): string {
	if (token.startsWith("**")) {
		// The trailing separator is part of the token, so `**\/x` also matches a
		// bare `x`.
		return "(?:.*)";
	}

	if (token === "*") {
		return "[^/]*";
	}

	if (token === "?") {
		return "[^/]";
	}

	if (token.startsWith("{")) {
		const alternatives = token.slice(1, -1).split(",");
		return `(?:${alternatives.map((alternative) => escapeRegExp(alternative)).join("|")})`;
	}

	return `\\${token}`;
}

/**
 * Match an EditorConfig section pattern against a path relative to the
 * `.editorconfig` file. Supports the `*`, `**`, `?` and `{a,b}` constructs;
 * numeric ranges and character classes are rare enough in formatting sections
 * to fall through as non-matches.
 *
 * @param pattern - The section pattern.
 * @param relativePath - Path relative to the `.editorconfig` directory.
 * @returns Whether the section applies.
 */
function matchesEditorConfigPattern(pattern: string, relativePath: string): boolean {
	// A pattern without a slash applies at any depth.
	const normalized = pattern.includes("/") ? pattern.replace(LEADING_SLASH, "") : `**/${pattern}`;
	const subject = relativePath.split(path.sep).join("/");

	const source = normalized.replaceAll(GLOB_TOKEN, (token) => expandGlobToken(token));
	const matcher = new RegExp(`^${source}$`);
	return matcher.test(subject);
}

/**
 * Resolve EditorConfig settings for a representative source file and translate
 * them into their Prettier equivalents.
 *
 * @param cwd - Directory to start the upward search from.
 * @returns The translated options.
 */
function resolveEditorConfigOptions(cwd: string): PrettierOptions {
	const properties: Record<string, string> = {};

	// Nearest file wins, so collect from the root down: `Object.assign` lets
	// closer directories overwrite what farther ones set.
	for (const directory of ancestorDirectories(cwd).toReversed()) {
		const contents = readFileOrUndefined(path.join(directory, ".editorconfig"));
		if (contents === undefined) {
			continue;
		}

		const { isRoot, sections } = parseEditorConfig(contents);
		const relative = path.relative(directory, path.join(cwd, EDITORCONFIG_PROBE_FILE));
		const forProbe = sections
			.filter(({ pattern }) => matchesEditorConfigPattern(pattern, relative))
			.reduce<Record<string, string>>(
				(accumulator, section) => Object.assign(accumulator, section.properties),
				{},
			);

		if (isRoot) {
			// Everything collected from farther ancestors is out of scope.
			for (const key of Object.keys(properties)) {
				delete properties[key];
			}
		}

		Object.assign(properties, forProbe);
	}

	return editorConfigToPrettier(properties);
}
