import { isentinel } from "@isentinel/eslint-config";
import type { OptionsConfig, TypedFlatConfigItem } from "@isentinel/eslint-config";

import { ESLint, type Linter } from "eslint";
import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURES_INPUT = path.resolve(PROJECT_ROOT, "fixtures", "input");

/** Path to the temporary fixtures directory. */
export const FIXTURES_TEMP = path.resolve(PROJECT_ROOT, "_fixtures");

const TSCONFIG_NAME = "_tsconfig.lint.json";

const TSCONFIG_TYPESCRIPT = JSON.stringify(
	{
		compilerOptions: {
			jsx: "react-jsx",
			module: "ESNext",
			moduleResolution: "bundler",
			noEmit: true,
			skipLibCheck: true,
			strict: true,
			target: "ESNext",
			verbatimModuleSyntax: true,
		},
		include: ["**/*.ts", "**/*.tsx"],
	},
	undefined,
	"\t",
);

const TSCONFIG_ROBLOX = JSON.stringify(
	{
		compilerOptions: {
			jsx: "react",
			module: "commonjs",
			moduleDetection: "force",
			moduleResolution: "node",
			noLib: true,
			skipLibCheck: true,
			strict: true,
			target: "ESNext",
		},
		include: ["**/*.ts", "**/*.tsx"],
	},
	undefined,
	"\t",
);

/**
 * Copy input fixtures, lint with --fix, return map of filename to
 * fixed content.
 * @param name
 * @param options
 */
export async function runFixtureLint(
	name: string,
	options?: Partial<OptionsConfig>,
): Promise<Map<string, string>> {
	const isRoblox = options?.roblox !== false;
	const temporaryDirectory = await prepareTemporaryDirectory(name, isRoblox);
	const configs = await buildConfig(temporaryDirectory, options);

	const eslint = new ESLint({
		cwd: temporaryDirectory,
		fix: true,
		overrideConfig: configs,
		overrideConfigFile: true,
	});

	const results = await eslint.lintFiles(".");
	await ESLint.outputFixes(results);

	return collectOutput(temporaryDirectory);
}

/**
 * Serialize a flat config array for snapshot comparison.
 * @param configs
 */
export function serializeConfigs(
	configs: Array<TypedFlatConfigItem>,
): Array<Record<string, unknown>> {
	return configs.map((config) => serializeSingleConfig(config));
}

/**
 * Build ESLint config array from factory options.
 * @param temporaryDirectory
 * @param options
 */
async function buildConfig(
	temporaryDirectory: string,
	options?: Partial<OptionsConfig>,
): Promise<Array<Linter.Config>> {
	const composer = await isentinel({
		name: "test/config",
		gitignore: false,
		isInEditor: false,
		pnpm: false,
		spellCheck: false,
		typescript: {
			tsconfigPath: path.join(temporaryDirectory, TSCONFIG_NAME),
		},
		...options,
	});

	return [...composer] as unknown as Array<Linter.Config>;
}

/**
 * Read all output files from temp directory, excluding the lint tsconfig.
 * @param temporaryDirectory
 */
async function collectOutput(temporaryDirectory: string): Promise<Map<string, string>> {
	const output = new Map<string, string>();
	const files = await fs.readdir(temporaryDirectory);

	for (const file of files) {
		if (file === TSCONFIG_NAME) {
			continue;
		}

		const filePath = path.join(temporaryDirectory, file);
		const stat = await fs.stat(filePath);

		if (stat.isFile()) {
			const content = await fs.readFile(filePath, "utf8");
			output.set(file, content);
		}
	}

	return output;
}

/**
 * Copy input fixtures and write tsconfig to temp directory.
 * @param name
 * @param isRoblox
 */
async function prepareTemporaryDirectory(name: string, isRoblox: boolean): Promise<string> {
	const temporaryDirectory = path.resolve(FIXTURES_TEMP, name);
	const tsconfig = isRoblox ? TSCONFIG_ROBLOX : TSCONFIG_TYPESCRIPT;

	await fs.cp(FIXTURES_INPUT, temporaryDirectory, { recursive: true });
	await fs.writeFile(path.join(temporaryDirectory, TSCONFIG_NAME), tsconfig);

	return temporaryDirectory;
}

/**
 * Extract parser name from a parser object.
 * @param parser
 */
function extractParserName(parser: unknown): string {
	if (typeof parser !== "object" || parser === null) {
		return "unknown";
	}

	const parserRecord = parser as Record<string, unknown>;
	const meta = parserRecord["meta"] as Record<string, unknown> | undefined;

	return String(meta?.["name"] ?? parserRecord["name"] ?? "unknown");
}

/**
 * Serialize language options, stripping non-deterministic fields.
 * @param languageOptions
 */
function serializeLanguageOptions(
	languageOptions: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...languageOptions };

	if (result["parser"] !== undefined && result["parser"] !== null) {
		result["parser"] = extractParserName(result["parser"]);
	}

	delete result["globals"];

	if (typeof result["parserOptions"] === "object" && result["parserOptions"] !== null) {
		const cleaned = { ...(result["parserOptions"] as Record<string, unknown>) };
		delete cleaned["tsconfigRootDir"];
		delete cleaned["projectService"];
		result["parserOptions"] = cleaned;
	}

	return result;
}

/**
 * Serialize rules object to sorted array of rule names.
 * @param rules
 */
function serializeRules(rules: Record<string, unknown>): Array<string> {
	const result: Array<string> = [];

	for (const [ruleName, ruleValue] of Object.entries(rules)) {
		if (ruleValue === undefined) {
			continue;
		}

		const severity: unknown = Array.isArray(ruleValue) ? ruleValue[0] : ruleValue;
		const isOff = severity === "off" || severity === 0;
		result.push(isOff ? `-${ruleName}` : ruleName);
	}

	result.sort();

	return result;
}

/**
 * Serialize a single config item.
 * @param config
 */
function serializeSingleConfig(config: TypedFlatConfigItem): Record<string, unknown> {
	const serialized: Record<string, unknown> = {};

	if (config.name !== undefined) {
		serialized["name"] = config.name;
	}

	if (config.files !== undefined) {
		serialized["files"] = config.files;
	}

	if (config.ignores !== undefined) {
		serialized["ignores"] = config.ignores;
	}

	if (config.plugins !== undefined) {
		serialized["plugins"] = Object.keys(config.plugins).sort();
	}

	if (config.languageOptions !== undefined) {
		serialized["languageOptions"] = serializeLanguageOptions(
			config.languageOptions as Record<string, unknown>,
		);
	}

	if (config.rules !== undefined) {
		serialized["rules"] = serializeRules(config.rules as Record<string, unknown>);
	}

	if (config.settings !== undefined) {
		serialized["settings"] = config.settings;
	}

	return serialized;
}
