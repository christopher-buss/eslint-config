/**
 * Internal helper process for {@link file://./ignored.ts}. Loads the consumer's
 * resolved ESLint config once and writes back what the runner needs to classify
 * lint targets: the config's match/ignore patterns when they are serializable,
 * and otherwise the ignored subset of a target list.
 *
 * Run as a child rather than in-process for two reasons: the config-loading
 * API is async while `plan` is synchronous end to end, and loading a
 * consumer's flat config pulls their whole plugin tree (and jiti) into memory
 * — 6-10s and several hundred MB in a large project, neither of which should
 * outlive the one query the runner needs.
 *
 * Invoked as `node <this file> <cwd> <outFile>` with the JSON target array on
 * stdin.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import type { IgnoredPayload, PredicateEntry } from "./ignored-predicate.ts";

/**
 * A synthetic basename for {@link createRequire}, which resolves relative to a
 * file rather than a directory. Spelled so it can never collide with a real
 * consumer module.
 */
const RESOLVE_ANCHOR = "__isentinel-lint__.js";

/** The subset of the `ESLint` class this helper uses. */
interface EslintLike {
	isPathIgnored: (filePath: string) => Promise<boolean>;
}

/** The subset of the `eslint` module namespace this helper uses. */
interface EslintModule {
	ESLint: new (options: { cwd: string }) => EslintLike;
}

/** The subset of the resolved config array this helper reads. */
interface ConfigArrayLike extends Array<Record<string, unknown>> {
	basePath: string;
}

/** The subset of `eslint/lib/config/config-loader.js` this helper uses. */
interface ConfigLoaderModule {
	ConfigLoader: new (options: {
		configFile: false | string | undefined;
		cwd: string;
		ignoreEnabled: boolean;
	}) => {
		loadConfigArrayForDirectory: (directoryPath: string) => Promise<ConfigArrayLike>;
	};
}

/**
 * The keys a {@link PredicateEntry} carries over verbatim. Anything else is
 * dropped, and its former presence recorded as
 * {@link PredicateEntry.nonGlobal}.
 */
const CARRIED_KEYS = new Set(["basePath", "files", "ignores", "name"]);

/**
 * Locate the `eslint` installation the consumer's config will be linted with:
 * their own, resolved from `cwd`, falling back to the one resolvable from this
 * file (the hoisted peer dependency) when `cwd` has no `node_modules` of its
 * own — the case in the fixture-based tests.
 *
 * @param cwd - The consumer project root.
 * @returns The absolute path to ESLint's `package.json`.
 * @throws {Error} When ESLint cannot be resolved from either location.
 */
function resolveEslintPackageJson(cwd: string): string {
	const requireFrom = createRequire(path.join(cwd, RESOLVE_ANCHOR));
	try {
		return requireFrom.resolve("eslint/package.json");
	} catch {
		return createRequire(import.meta.url).resolve("eslint/package.json");
	}
}

/**
 * Whether a `files`/`ignores` value is made purely of glob strings. Flat config
 * also permits function matchers, and `files` may nest one level for AND
 * matching; a function anywhere leaves the config with no form as data.
 *
 * @param value - The `files` or `ignores` value to test.
 * @returns True when every matcher is a string.
 */
function isGlobList(value: unknown): value is Array<Array<string> | string> {
	return Array.isArray(value) && value.flat(1).every((matcher) => typeof matcher === "string");
}

/**
 * Reduce one resolved config object to its match keys, or `undefined` when a
 * matcher is a function rather than a glob.
 *
 * @param config - One entry of the resolved config array.
 * @returns The serializable entry, or `undefined` when it cannot be serialized.
 */
function serializeEntry(config: Record<string, unknown>): PredicateEntry | undefined {
	const entry: PredicateEntry = {};

	const { files, ignores } = config;
	if (files !== undefined) {
		if (!isGlobList(files)) {
			return undefined;
		}

		entry.files = files;
	}

	if (ignores !== undefined) {
		if (!isGlobList(ignores)) {
			return undefined;
		}

		entry.ignores = ignores as Array<string>;
	}

	if (typeof config["basePath"] === "string") {
		entry.basePath = config["basePath"];
	}

	if (typeof config["name"] === "string") {
		entry.name = config["name"];
	}

	if (Object.keys(config).some((key) => !CARRIED_KEYS.has(key))) {
		entry.nonGlobal = true;
	}

	return entry;
}

/**
 * Serialize the resolved config's match and ignore patterns, which the runner
 * can then evaluate itself for any path — including files that did not exist
 * when this ran.
 *
 * Reaching the config array means reaching past the `eslint` package's exports
 * map: no public API returns it, and `calculateConfigForFile` strips exactly
 * the `files`/`ignores` keys this needs. That coupling is contained by the
 * caller — an `undefined` return here falls back to the per-target query below,
 * which is the behaviour this replaced.
 *
 * @param cwd - The consumer project root.
 * @returns The serialized predicate, or `undefined` when it is unavailable.
 */
async function queryPredicate(cwd: string): Promise<IgnoredPayload | undefined> {
	let configArray: ConfigArrayLike;
	try {
		const requireFrom = createRequire(path.join(cwd, RESOLVE_ANCHOR));
		const root = path.dirname(resolveEslintPackageJson(cwd));
		const { ConfigLoader } = requireFrom(
			path.join(root, "lib", "config", "config-loader.js"),
		) as ConfigLoaderModule;
		const loader = new ConfigLoader({ configFile: undefined, cwd, ignoreEnabled: true });
		// `loadConfigArrayForDirectory` resolves the config for the *parent* of
		// what it is given, so the placeholder makes it `cwd` itself.
		configArray = await loader.loadConfigArrayForDirectory(path.join(cwd, "__placeholder__"));
	} catch {
		return undefined;
	}

	const entries: Array<PredicateEntry> = [];
	for (const config of configArray) {
		const entry = serializeEntry(config);
		if (entry === undefined) {
			// A function matcher, which no file can carry across a process
			// boundary. One is enough to sink the whole array.
			return undefined;
		}

		entries.push(entry);
	}

	return { basePath: configArray.basePath, entries, mode: "predicate" };
}

/**
 * Load the ESLint the consumer's config will be linted with.
 *
 * @param cwd - The consumer project root.
 * @returns The `eslint` module namespace.
 * @rejects {Error} When ESLint cannot be resolved from either location.
 */
async function loadEslint(cwd: string): Promise<EslintModule> {
	const root = path.dirname(resolveEslintPackageJson(cwd));
	const requireFrom = createRequire(path.join(root, RESOLVE_ANCHOR));
	return (await import(pathToFileURL(requireFrom.resolve("eslint")).href)) as EslintModule;
}

/**
 * Ask ESLint about each target in turn — correct for the targets that exist
 * right now, and the fallback whenever the config's patterns cannot be
 * serialized.
 *
 * @param cwd - The consumer project root.
 * @param targets - The target files to classify.
 * @returns The ignored subset of `targets`.
 */
async function queryAnswers(cwd: string, targets: Array<string>): Promise<IgnoredPayload> {
	const { ESLint } = await loadEslint(cwd);
	const eslint = new ESLint({ cwd });

	const ignored: Array<string> = [];
	for (const target of targets) {
		if (await eslint.isPathIgnored(target)) {
			ignored.push(target);
		}
	}

	return { ignored, mode: "answers" };
}

async function main(): Promise<void> {
	const [cwd, outFile] = process.argv.slice(2);
	if (cwd === undefined || outFile === undefined) {
		throw new Error("usage: node ignored-child <cwd> <outFile> (targets on stdin)");
	}

	const targets = JSON.parse(fs.readFileSync(0, "utf8")) as Array<string>;
	const payload = (await queryPredicate(cwd)) ?? (await queryAnswers(cwd, targets));

	fs.writeFileSync(outFile, JSON.stringify(payload));
}

void main().catch(() => {
	// The parent treats a non-zero exit as "no filtering"; nothing to report.
	process.exitCode = 1;
});
