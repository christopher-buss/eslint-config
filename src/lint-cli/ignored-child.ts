/**
 * Internal helper process for {@link file://./ignored.ts}. Loads the consumer's
 * resolved ESLint config once and writes back what the runner needs to classify
 * lint targets: the config's match patterns when they are serializable, and
 * otherwise the ignored subset of a target list.
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
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { resolveEslintInstall } from "./eslint-install.ts";
import type { IgnoredPayload, PredicateEntry } from "./ignored-predicate.ts";

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
	getConfigStatus: (filePath: string) => string;
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
 * The config keys that leave a `files`-less config able to say something about
 * a path, mirroring `META_FIELDS` in `@eslint/config-array`: a config carrying
 * `ignores` and nothing else outside this set is a global ignore, and one with
 * any further key only excludes files from itself.
 */
const META_KEYS = new Set(["basePath", "name"]);

/**
 * Load the consumer's resolved config array.
 *
 * Reaching it means reaching past the `eslint` package's exports map: no public
 * API returns it, and `calculateConfigForFile` strips exactly the
 * `files`/`ignores` keys this needs. Only that coupling is caught here — a
 * config that throws on load is a broken project, not a missing capability, and
 * is left to fail the helper outright rather than be retried through a second,
 * equally doomed config load.
 *
 * @param cwd - The consumer project root.
 * @returns The config array, or `undefined` when the loader is unreachable.
 * @rejects {Error} When the consumer's config fails to load.
 */
async function loadConfigArray(cwd: string): Promise<ConfigArrayLike | undefined> {
	let loader;
	try {
		const { requireFrom, root } = resolveEslintInstall(cwd);
		const { ConfigLoader } = requireFrom(
			path.join(root, "lib", "config", "config-loader.js"),
		) as ConfigLoaderModule;
		loader = new ConfigLoader({ configFile: undefined, cwd, ignoreEnabled: true });
	} catch {
		return undefined;
	}

	// `loadConfigArrayForDirectory` resolves the config for the *parent* of what
	// it is given, so the placeholder makes it `cwd` itself.
	return loader.loadConfigArrayForDirectory(path.join(cwd, "__placeholder__"));
}

/**
 * Whether a config ignores paths for the whole run rather than just for itself.
 *
 * @param config - One entry of the resolved config array.
 * @returns True when `ignores` is the config's only substantive key.
 */
function isGlobalIgnore(config: Record<string, unknown>): boolean {
	return (
		config["ignores"] !== undefined &&
		Object.keys(config).filter((key) => !META_KEYS.has(key)).length === 1
	);
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
 * Reduce one config to its match keys.
 *
 * @param config - One entry of the resolved config array.
 * @returns The entry, or `undefined` when a matcher is a function.
 */
function serializeEntry({
	basePath,
	files,
	ignores,
}: Record<string, unknown>): PredicateEntry | undefined {
	const entry: PredicateEntry = {};

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

		entry.ignores = ignores;
	}

	if (typeof basePath === "string") {
		entry.basePath = basePath;
	}

	return entry;
}

/**
 * Reduce the resolved config array to the entries that decide whether ESLint
 * lints a path at all, or `undefined` when a matcher is a function rather than
 * a glob and so cannot cross a process boundary.
 *
 * Only two kinds of entry can make that decision: one with `files`, which can
 * match a path, and a bare global ignore, which can veto it. A `files`-less
 * config with other keys alongside its `ignores` merely narrows which configs
 * merge into the one ESLint lints with, which nothing here reads — so it is
 * dropped rather than carried, and with it the risk of a stripped `rules` key
 * silently promoting it into a global ignore.
 *
 * @param configArray - The resolved config array.
 * @returns The serializable entries, or `undefined` when one is a function.
 */
function serializeEntries(configArray: ConfigArrayLike): Array<PredicateEntry> | undefined {
	const entries: Array<PredicateEntry> = [];

	for (const config of configArray) {
		if (config["files"] === undefined && !isGlobalIgnore(config)) {
			continue;
		}

		const entry = serializeEntry(config);
		if (entry === undefined) {
			return undefined;
		}

		entries.push(entry);
	}

	return entries;
}

/**
 * The last-resort classification: load ESLint itself and ask it per target.
 * Only reached when no config array could be built, so nothing cheaper is
 * already in hand.
 *
 * @param cwd - The consumer project root.
 * @param targets - The target files to classify.
 * @returns The ignored subset of `targets`.
 * @rejects {Error} When ESLint cannot be resolved or its config fails to load.
 */
async function queryEslint(cwd: string, targets: Array<string>): Promise<Array<string>> {
	const { requireFrom } = resolveEslintInstall(cwd);
	const { ESLint } = (await import(
		pathToFileURL(requireFrom.resolve("eslint")).href
	)) as EslintModule;
	const eslint = new ESLint({ cwd });

	const ignored: Array<string> = [];
	for (const target of targets) {
		if (await eslint.isPathIgnored(target)) {
			ignored.push(target);
		}
	}

	return ignored;
}

/**
 * The target list, read only by the paths that classify it — the predicate
 * never looks at it, and it is the larger of the two inputs.
 *
 * @returns The target files, absolute.
 */
function readTargets(): Array<string> {
	return JSON.parse(fs.readFileSync(0, "utf8")) as Array<string>;
}

/**
 * The best answer this helper can give: the config's patterns when they are
 * data, the ignored subset of the target list when they are not.
 *
 * Both fallbacks reuse whatever the step before them already paid for. A config
 * that holds a function matcher still classifies targets here, off the array
 * already loaded, rather than loading the config a second time through `ESLint`
 * — which only the case of no reachable config loader at all has to fall back
 * to.
 *
 * @param cwd - The consumer project root.
 * @returns The payload to write back.
 * @rejects {Error} When the consumer's config fails to load.
 */
async function resolvePayload(cwd: string): Promise<IgnoredPayload> {
	const configArray = await loadConfigArray(cwd);
	if (configArray === undefined) {
		return { ignored: await queryEslint(cwd, readTargets()), mode: "answers" };
	}

	const entries = serializeEntries(configArray);
	if (entries === undefined) {
		const ignored = readTargets().filter(
			(target) => configArray.getConfigStatus(target) !== "matched",
		);
		return { ignored, mode: "answers" };
	}

	return { basePath: configArray.basePath, entries, mode: "predicate" };
}

async function main(): Promise<void> {
	const [cwd, outFile] = process.argv.slice(2);
	if (cwd === undefined || outFile === undefined) {
		throw new Error("usage: node ignored-child <cwd> <outFile> (targets on stdin)");
	}

	fs.writeFileSync(outFile, JSON.stringify(await resolvePayload(cwd)));
}

void main().catch(() => {
	// The parent treats a non-zero exit as "no filtering"; nothing to report.
	process.exitCode = 1;
});
