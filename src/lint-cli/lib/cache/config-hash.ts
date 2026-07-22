// cspell:words extensionless mtimes typeaware
import crypto from "node:crypto";
import path from "node:path";
import type * as TypeScript from "typescript";

import { readFileIfPresent } from "../state.ts";
import { loadTypescript } from "../typescript/load.ts";

/**
 * Upper bound on the number of files walked from the config entry points. A
 * flat-config import graph is a handful of local modules; the cap only guards
 * against a pathological graph and never trips in practice.
 */
const MAX_CLOSURE_FILES = 500;

/**
 * One file in the config import closure, read once for both imports and hash.
 */
interface ClosureFile {
	/** The file's UTF-8 content. */
	content: string;
	/** The absolute, normalized path. */
	file: string;
}

/** The TypeScript state threaded through the closure walk. */
interface ClosureResolver {
	/** The shared module-resolution cache. */
	cache: TypeScript.ModuleResolutionCache;
	/** The compiler options resolved for module lookup. */
	options: TypeScript.CompilerOptions;
	/** The consumer's resolved TypeScript module. */
	ts: typeof TypeScript;
}

/**
 * Hash the content of `eslint.config.*` and its transitive local import
 * closure. This models the input ESLint keys its per-entry `hashOfConfig` on:
 * ESLint re-lints every file when the resolved config changes, but the runner's
 * dirty count only sees the config file (via `CACHE_BUST_PATTERNS`), not the
 * modules it imports. Hashing content (not mtimes) means a checkout or a
 * save-without-change never busts.
 *
 * The closure is discovered with the consumer's own TypeScript: a lexer
 * extracts each specifier and `resolveModuleName` resolves it (honouring
 * tsconfig `paths`/`baseUrl`, extension-less and `index` lookups, and
 * re-export forwarding). External (`node_modules`) imports are dropped — a
 * dependency swap is already covered by the lockfile bust and `package-hash`.
 * Returns `undefined` when `typescript` is unresolvable or no config entry
 * point exists, so the caller treats the check as a no-op.
 *
 * @param cwd - The consumer project root.
 * @param configFiles - The flat-config entry points (see `RepoFiles.configFiles`).
 * @returns The hex digest, or `undefined` when unavailable.
 */
export function computeConfigHash(cwd: string, configFiles: Array<string>): string | undefined {
	if (configFiles.length === 0) {
		return undefined;
	}

	const ts = loadTypescript(cwd);
	if (ts === undefined) {
		return undefined;
	}

	const closure = discoverConfigClosure(ts, cwd, configFiles);
	if (closure.length === 0) {
		return undefined;
	}

	const hash = crypto.createHash("sha256");
	for (const { content, file } of closure) {
		hash.update(file);
		hash.update("\0");
		hash.update(content);
		hash.update("\0");
	}

	return hash.digest("hex");
}

/**
 * Add every not-yet-seen target to the visited set and the work queue.
 *
 * @param targets - The candidate import targets.
 * @param visited - The set of already-seen paths (mutated).
 * @param queue - The BFS work queue (mutated).
 */
function enqueueUnvisited(
	targets: Array<string>,
	visited: Set<string>,
	queue: Array<string>,
): void {
	for (const target of targets) {
		if (visited.has(target)) {
			continue;
		}

		visited.add(target);
		queue.push(target);
	}
}

/**
 * Resolve every in-project import found in one file's already-read content.
 * `node_modules` results and unresolvable specifiers are dropped, so a
 * dependency swap (covered by the lockfile bust) never enters the closure.
 *
 * @param resolver - The shared TypeScript resolution state.
 * @param file - The absolute path of the importing file.
 * @param content - The importing file's content.
 * @returns The absolute, normalized in-project import targets.
 */
function importsOf(
	{ cache, options, ts }: ClosureResolver,
	file: string,
	content: string,
): Array<string> {
	const targets: Array<string> = [];
	const nodeModules = `${path.sep}node_modules${path.sep}`;
	for (const reference of ts.preProcessFile(content, true, true).importedFiles) {
		const resolved = ts.resolveModuleName(
			reference.fileName,
			file,
			options,
			ts.sys,
			cache,
		).resolvedModule;
		if (resolved === undefined || resolved.isExternalLibraryImport === true) {
			continue;
		}

		const target = path.normalize(resolved.resolvedFileName);
		if (!target.includes(nodeModules)) {
			targets.push(target);
		}
	}

	return targets;
}

/**
 * Resolve the consumer's compiler options from the nearest `tsconfig.json` so
 * `resolveModuleName` honours `paths`/`baseUrl`. Falls back to empty options
 * (relative and `node_modules` resolution still work) when none is found or it
 * fails to parse.
 *
 * @param ts - The consumer's resolved TypeScript module.
 * @param cwd - The consumer project root.
 * @returns The parsed compiler options.
 */
function resolveCompilerOptions(ts: typeof TypeScript, cwd: string): TypeScript.CompilerOptions {
	const configPath = ts.findConfigFile(cwd, (file) => ts.sys.fileExists(file), "tsconfig.json");
	if (configPath === undefined) {
		return {};
	}

	const read = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
	if (read.error !== undefined || read.config === undefined) {
		return {};
	}

	// Only `.options` is needed, so a no-op `readDirectory` skips the full
	// source-tree glob `parseJsonConfigFileContent` would otherwise run to build
	// the (discarded) `.fileNames`; `extends` still resolves via readFile.
	const host: TypeScript.ParseConfigHost = {
		fileExists: (file) => ts.sys.fileExists(file),
		readDirectory: () => [],
		readFile: (file) => ts.sys.readFile(file),
		useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
	};
	return ts.parseJsonConfigFileContent(read.config, host, path.dirname(configPath)).options;
}

/**
 * Walk the local import closure of the config entry points. BFS with a
 * normalized-path visited set; the roots are included so their own content
 * contributes to the hash. Each file is read exactly once — the content feeds
 * both import extraction and the hash.
 *
 * @param ts - The consumer's resolved TypeScript module.
 * @param cwd - The consumer project root.
 * @param roots - The config entry-point paths to start from.
 * @returns The readable closure files (roots included), each with its content.
 */
function discoverConfigClosure(
	ts: typeof TypeScript,
	cwd: string,
	roots: Array<string>,
): Array<ClosureFile> {
	const options = resolveCompilerOptions(ts, cwd);
	const resolver: ClosureResolver = {
		cache: ts.createModuleResolutionCache(cwd, (fileName) => fileName, options),
		options,
		ts,
	};
	const visited = new Set<string>();
	const queue: Array<string> = [];
	enqueueUnvisited(
		roots.map((root) => path.normalize(root)),
		visited,
		queue,
	);

	const files: Array<ClosureFile> = [];
	while (queue.length > 0 && visited.size <= MAX_CLOSURE_FILES) {
		const file = queue.shift();
		if (file === undefined) {
			break;
		}

		const content = readFileIfPresent(file);
		if (content === undefined) {
			continue;
		}

		files.push({ content, file });
		enqueueUnvisited(importsOf(resolver, file, content), visited, queue);
	}

	return files;
}
