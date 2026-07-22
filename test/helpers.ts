import { ESLint } from "eslint";
import type { Linter } from "eslint";
import fs from "node:fs/promises";
import path from "node:path";

import { isentinel } from "../src/index.ts";
import type { OptionsConfig, TypedFlatConfigItem } from "../src/index.ts";

/** Factory options accepted by the fixture helpers. */
export type FixtureOptions = Partial<Omit<OptionsConfig, "ignores" | "namedConfigs">>;

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
 *
 * @param name - Unique name for the temporary fixture directory.
 * @param options - Factory options for the config variant under test.
 * @returns A map of fixture filename to its post-fix content.
 */
export async function runFixtureLint(
	name: string,
	options?: FixtureOptions,
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
 *
 * @param configs - The resolved flat config items.
 * @returns Plain objects with non-deterministic fields stripped.
 */
export function serializeConfigs(
	configs: Array<TypedFlatConfigItem>,
): Array<Record<string, unknown>> {
	return configs.map((config) => serializeSingleConfig(config));
}

/**
 * Build ESLint config array from factory options.
 *
 * @param temporaryDirectory - Directory containing the fixture tsconfig.
 * @param options - Factory options for the config variant under test.
 * @returns The resolved flat config array.
 */
async function buildConfig(
	temporaryDirectory: string,
	options?: FixtureOptions,
): Promise<Array<Linter.Config>> {
	const composer = await isentinel({
		name: "test/config",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		pnpm: false,
		spellCheck: false,
		typescript: {
			// The fixture dir has no owning project: the copied `tsconfig.json`
			// fixture only includes `src/**`, and the repo root config excludes
			// `_fixtures`. Point the project service at the temp dir so fixtures
			// resolve through `defaultProject` instead of ancestor lookup.
			parserOptionsTypeAware: {
				projectService: {
					allowDefaultProject: ["*.ts", "*.tsx"],
					defaultProject: TSCONFIG_NAME,
				},
				tsconfigRootDir: temporaryDirectory,
			},
			tsconfigPath: path.join(temporaryDirectory, TSCONFIG_NAME),
		},
		...options,
	});

	return [...composer];
}

/**
 * Read all output files from temp directory, excluding the lint tsconfig.
 *
 * @param temporaryDirectory - Directory to read the linted files from.
 * @returns A map of filename to file content.
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
 *
 * @param name - Unique name for the temporary fixture directory.
 * @param isRoblox - Whether to write the roblox-ts tsconfig variant.
 * @returns The absolute path of the prepared directory.
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
 *
 * @param parser - The parser value from languageOptions.
 * @returns The parser name, or "unknown" when it cannot be determined.
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
 *
 * @param languageOptions - The languageOptions object to serialize.
 * @returns A copy safe for snapshot comparison.
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
 * Serialize rules object to sorted array of rule entries.
 *
 * Severity and options are kept so that changing either shows up in the
 * snapshot: disabled rules are prefixed with "-", warnings are tagged
 * `(warn)`, and any rule options follow as compact JSON.
 *
 * @param rules - The rules record from a config item.
 * @returns Sorted rule entries.
 */
function serializeRules(rules: Record<string, unknown>): Array<string> {
	const result: Array<string> = [];

	for (const [ruleName, ruleValue] of Object.entries(rules)) {
		if (ruleValue === undefined) {
			continue;
		}

		const isArray = Array.isArray(ruleValue);
		const severity: unknown = isArray ? ruleValue[0] : ruleValue;
		const isOff = severity === "off" || severity === 0;
		const options = isArray ? (ruleValue as Array<unknown>).slice(1) : [];

		let entry = isOff ? `-${ruleName}` : ruleName;
		if (!isOff && (severity === "warn" || severity === 1)) {
			entry += " (warn)";
		}

		if (options.length > 0) {
			entry += ` ${JSON.stringify(options)}`;
		}

		result.push(entry);
	}

	result.sort();

	return result;
}

/**
 * Serialize a single config item.
 *
 * @param config - The flat config item to serialize.
 * @returns A plain object safe for snapshot comparison.
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
		serialized["languageOptions"] = serializeLanguageOptions(config.languageOptions);
	}

	if (config.rules !== undefined) {
		serialized["rules"] = serializeRules(config.rules as Record<string, unknown>);
	}

	if (config.settings !== undefined) {
		serialized["settings"] = config.settings;
	}

	return serialized;
}
