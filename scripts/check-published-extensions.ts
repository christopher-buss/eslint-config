/**
 * Guards the `consumerFacing` flags in `pnpm-plugin/extensions.mjs` against the
 * only thing that decides them: which packages' declarations a consumer's
 * TypeScript program actually loads.
 *
 * The shipped hook applies just the flagged entries, so a missing flag hands
 * consumers back the `any` types the table exists to prevent, and a stale one
 * installs `@types` packages nobody's program reads. Neither is visible from
 * reading the table, so the set is derived rather than trusted: a program is
 * built from the public entry points and every declaration it pulls in is
 * mapped back to its package.
 *
 * The probe is served from memory, so nothing is written to `dist`. It is
 * resolved as though it sat there, which is what makes the entry points' bare
 * imports resolve the way a consumer's would.
 *
 * This can only see what already resolves, which is the one thing it cannot be
 * trusted alone for: an under-declared import nobody has repaired yet never
 * loads, so its package looks as though no consumer reaches it.
 * `scripts/check-package-extensions.ts` is what closes that, reading
 * declarations statically rather than through a program. The two run together
 * for that reason; neither subsumes the other.
 *
 * Needs `dist`, so it runs after `pnpm build` (the order CI uses).
 */
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { packageExtensions } from "../pnpm-plugin/extensions.mjs";
import { isRecord } from "../src/guards.ts";

/** The manifest fields whose entries a consumer actually installs. */
const CONSUMER_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];

/**
 * Every entry point in the `exports` map. A missing `types` condition does not
 * keep one out: TypeScript falls back to the declaration file sitting next to
 * the target, so `./cli` and `./formatter-agents` load `cli.d.mts` and
 * `formatter-agents.d.mts` all the same.
 */
const PUBLIC_ENTRY_POINTS = ["./index.mjs", "./oxlint.mjs", "./cli.mjs", "./formatter-agents.mjs"];

const PROBE_FILE = "_published-probe.mts";

/**
 * Both resolution modes a consumer might typecheck under. The reachable set is
 * the union: a package reached under either one can degrade for somebody.
 */
const RESOLUTION_MODES = [
	{ module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
	{ module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
];

const NODE_MODULES = "node_modules";

const PATH_SEGMENT = /[/\\]/u;

const BUILTINS = new Set([
	...builtinModules,
	...builtinModules.map((name) => `node:${name}`),
	// Loaded globally through `types`, not through any importer.
	"@types/node",
]);

const scriptPath = fileURLToPath(import.meta.url);
const rootDirectory = path.resolve(path.dirname(scriptPath), "..");
const distributionDirectory = path.join(rootDirectory, "dist");

/**
 * Builds a program from the public entry points and sorts every declaration it
 * loaded by owner.
 *
 * @param mode - The resolution mode to build under.
 * @returns The packages loaded, and the files belonging to no package — our own
 *   emitted declarations.
 */
/** Files a probe compile pulled in: ours, and the packages they came from. */
interface LoadedFiles {
	ours: Array<string>;
	packages: Set<string>;
}

/**
 * Diffs the flags against the derived set.
 *
 * @param injecting - The entries that inject something, so have a flag that can
 *   be wrong.
 * @param loaded - The packages a consumer's program loads.
 * @returns The names flagged too little and too much.
 */
/** Entries whose `consumerFacing` flag disagrees with what actually loaded. */
interface FlagAudit {
	missing: Array<string>;
	stale: Array<string>;
}

/**
 * Reduces a loaded file path to the package that owns it. The last
 * `node_modules` segment wins, which is what identifies the package under
 * either store layout: a global virtual store path ends in
 * `.../node_modules/<name>/...` just as a nested one does.
 *
 * @param file - An absolute path to a loaded declaration file.
 * @returns The owning package name, or undefined for a file outside any
 *   `node_modules`.
 */
function owningPackage(file: string): string | undefined {
	const segments = file.split(PATH_SEGMENT);
	const last = segments.lastIndexOf(NODE_MODULES);
	if (last === -1) {
		return undefined;
	}

	const [scopeOrName, nested] = segments.slice(last + 1);
	if (scopeOrName === undefined) {
		return undefined;
	}

	return nested !== undefined && scopeOrName.startsWith("@")
		? `${scopeOrName}/${nested}`
		: scopeOrName;
}

/**
 * Reduces a module specifier to the package it resolves from, dropping any
 * subpath.
 *
 * @param specifier - A bare module specifier.
 * @returns The portion of it that names a package.
 */
function packageNameOf(specifier: string): string {
	const segments = specifier.split("/");
	return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] ?? specifier);
}

/**
 * The probe module: a wildcard import of every public entry point, which loads
 * each one's declarations whole rather than only what one exported symbol
 * reaches.
 *
 * @returns Its source text.
 */
function probeSource(): string {
	const imports = PUBLIC_ENTRY_POINTS.map((entry, index) => {
		return `import * as entry${index} from "${entry}";`;
	});
	const names = PUBLIC_ENTRY_POINTS.map((_, index) => `entry${index}`);

	return [...imports, `export const probed = [${names.join(", ")}];`, ""].join("\n");
}

/**
 * A compiler host that serves the probe from memory and everything else from
 * disk.
 *
 * @param options - The options the program is built with.
 * @param probePath - Where the probe is resolved from.
 * @param probe - Its source text.
 * @returns A host that resolves the probe as though it sat in `dist`.
 */
function createProbeHost(
	options: ts.CompilerOptions,
	probePath: string,
	probe: string,
): ts.CompilerHost {
	const host = ts.createCompilerHost(options, true);
	const readFile = host.readFile.bind(host);
	const fileExists = host.fileExists.bind(host);
	const getSourceFile = host.getSourceFile.bind(host);
	const resolved = path.resolve(probePath);

	/**
	 * Whether a path names the probe.
	 *
	 * @param fileName - The path TypeScript asked for.
	 * @returns Whether to serve it from memory.
	 */
	function isProbe(fileName: string): boolean {
		return path.resolve(fileName) === resolved;
	}

	/**
	 * Serves the probe's text, or reads from disk.
	 *
	 * @param fileName - The path to read.
	 * @returns Its contents, or undefined when there are none.
	 */
	host.readFile = (fileName) => (isProbe(fileName) ? probe : readFile(fileName));

	/**
	 * Reports the probe as present, since nothing wrote it.
	 *
	 * @param fileName - The path to test.
	 * @returns Whether it exists.
	 */
	host.fileExists = (fileName) => isProbe(fileName) || fileExists(fileName);

	/**
	 * Parses the probe from memory. It is `.mts`, so it is ESM under either
	 * mode; `ScriptKind.TS` is the kind for every TypeScript extension, module
	 * format aside.
	 *
	 * @param fileName - The path to parse.
	 * @param languageVersion - The target to parse against.
	 * @param rest - Everything the real host takes after those.
	 * @returns The parsed file, or undefined when there is none.
	 */
	host.getSourceFile = (fileName, languageVersion, ...rest) => {
		return isProbe(fileName)
			? ts.createSourceFile(fileName, probe, languageVersion, true, ts.ScriptKind.TS)
			: getSourceFile(fileName, languageVersion, ...rest);
	};

	return host;
}

function loadedFiles(mode: (typeof RESOLUTION_MODES)[number]): LoadedFiles {
	const probePath = path.join(distributionDirectory, PROBE_FILE);
	const probe = probeSource();
	const options: ts.CompilerOptions = {
		...mode,
		noEmit: true,
		skipLibCheck: true,
		target: ts.ScriptTarget.ESNext,
		types: ["node"],
	};

	const program = ts.createProgram(
		[probePath],
		options,
		createProbeHost(options, probePath, probe),
	);
	const packages = new Set<string>();
	const ours: Array<string> = [];

	for (const file of program.getSourceFiles()) {
		const owner = owningPackage(file.fileName);
		if (owner !== undefined) {
			packages.add(owner);
		} else if (path.resolve(file.fileName) !== path.resolve(probePath)) {
			ours.push(file.fileName);
		}
	}

	return { ours, packages };
}

/**
 * Everything the root manifest gives a consumer, by name.
 *
 * `devDependencies` is deliberately left out: it is precisely what a consumer
 * never receives, and so what makes an import unresolvable for them.
 *
 * @returns The names a consumer can resolve, including our own.
 */
function declaredForConsumers(): Set<string> {
	const parsed: unknown = JSON.parse(
		readFileSync(path.join(rootDirectory, "package.json"), "utf8"),
	);
	const declared = new Set<string>();
	if (!isRecord(parsed)) {
		return declared;
	}

	const { name } = parsed;
	if (typeof name === "string") {
		declared.add(name);
	}

	for (const field of CONSUMER_FIELDS) {
		const value = parsed[field];
		if (isRecord(value)) {
			for (const dependency of Object.keys(value)) {
				declared.add(dependency);
			}
		}
	}

	return declared;
}

/**
 * The packages a declaration file imports that `declared` does not cover.
 *
 * @param file - The declaration file to read.
 * @param declared - What the root manifest gives a consumer.
 * @returns The uncovered package names, sorted.
 */
function unresolvableFrom(file: string, declared: Set<string>): Array<string> {
	const info = ts.preProcessFile(readFileSync(file, "utf8"), true, true);
	const missing = new Set<string>();

	for (const { fileName } of info.importedFiles) {
		// A relative, absolute or subpath specifier resolves within the package
		// itself, so no declaration has to cover it.
		const isBare =
			!fileName.startsWith(".") && !fileName.startsWith("/") && !fileName.startsWith("#");
		const name = packageNameOf(fileName);
		if (isBare && !BUILTINS.has(name) && !declared.has(name)) {
			missing.add(name);
		}
	}

	return [...missing].toSorted();
}

/**
 * Reports what our own emitted declarations import but the root manifest does
 * not give a consumer.
 *
 * This is the same failure the table repairs, one level up: a `devDependency`
 * reaches nobody downstream, so the import resolves here and nowhere else,
 * silently, because `skipLibCheck` swallows the `TS2307`. It cannot be a table
 * entry — the root package is ours to declare, not a dependency's to repair.
 *
 * @param ours - The emitted declaration files the program loaded.
 * @returns Each file mapped to the specifiers a consumer cannot resolve.
 */
function findUndeclaredByUs(ours: Array<string>): Map<string, Array<string>> {
	const declared = declaredForConsumers();
	const undeclared = new Map<string, Array<string>>();

	for (const file of ours) {
		const missing = unresolvableFrom(file, declared);
		if (missing.length > 0) {
			undeclared.set(path.relative(rootDirectory, file), missing);
		}
	}

	return undeclared;
}

function findDisagreements(injecting: typeof packageExtensions, loaded: Set<string>): FlagAudit {
	const missing: Array<string> = [];
	const stale: Array<string> = [];

	for (const extension of injecting) {
		const isLoaded = loaded.has(extension.name);
		const isFlagged = extension.consumerFacing === true;
		if (isLoaded && !isFlagged) {
			missing.push(extension.name);
		} else if (!isLoaded && isFlagged) {
			stale.push(extension.name);
		}
	}

	return { missing, stale };
}

/**
 * Reports every flag that disagrees with the derived set.
 *
 * @param loaded - The packages a consumer's program loads.
 * @returns The process exit code.
 */
function report(loaded: Set<string>): number {
	// An entry that injects nothing has no flag to get wrong.
	const injecting = packageExtensions.filter((extension) => {
		return extension.dependencies !== undefined || extension.peerDependencies !== undefined;
	});
	const { missing, stale } = findDisagreements(injecting, loaded);

	for (const name of missing) {
		console.error(
			`[check-published] ${name} is loaded by a consumer's program but is not marked ` +
				"`consumerFacing`, so the shipped hook leaves it broken.",
		);
	}

	for (const name of stale) {
		console.error(
			`[check-published] ${name} is marked \`consumerFacing\` but no consumer loads its ` +
				"declarations, so the shipped hook installs types nothing reads.",
		);
	}

	if (missing.length > 0 || stale.length > 0) {
		console.error(
			"[check-published] Update the `consumerFacing` flags in pnpm-plugin/extensions.mjs.",
		);
		return 1;
	}

	const flagged = injecting.filter((extension) => extension.consumerFacing === true).length;
	console.log(
		`[check-published] ${loaded.size} packages reachable from the published declarations; ` +
			`all ${injecting.length} injecting entries agree (${flagged} shipped).`,
	);

	return 0;
}

/**
 * The union across every resolution mode: a package reached under one of them
 * can degrade for whoever typechecks that way.
 *
 * @returns Every package a consumer's program can load, and every declaration
 *   we emitted ourselves.
 */
function reachable(): LoadedFiles {
	const packages = new Set<string>();
	const ours = new Set<string>();

	for (const mode of RESOLUTION_MODES) {
		const loaded = loadedFiles(mode);
		for (const name of loaded.packages) {
			packages.add(name);
		}

		for (const file of loaded.ours) {
			ours.add(file);
		}
	}

	return { ours: [...ours].toSorted(), packages };
}

/**
 * Reports what our own declarations ask of a consumer that they cannot supply.
 *
 * @param ours - The emitted declaration files the program loaded.
 * @returns The process exit code.
 */
function reportOurs(ours: Array<string>): number {
	const undeclared = findUndeclaredByUs(ours);

	for (const [file, names] of undeclared) {
		console.error(
			`[check-published] ${file} imports ${names.join(", ")}, which the root package does ` +
				"not declare outside `devDependencies`. A consumer cannot resolve it, so the type " +
				"degrades to `any` behind `skipLibCheck`.",
		);
	}

	if (undeclared.size > 0) {
		console.error(
			"[check-published] Move it into `dependencies` or `peerDependencies`, or stop the " +
				"declarations from referencing it.",
		);
		return 1;
	}

	return 0;
}

/**
 * Derives the reachable set and checks the flags against it.
 *
 * @returns The process exit code.
 */
function main(): number {
	if (!existsSync(path.join(distributionDirectory, "index.d.mts"))) {
		console.error(
			"[check-published] dist/index.d.mts is missing. Run `pnpm build` before this check.",
		);
		return 1;
	}

	const { ours, packages } = reachable();
	if (packages.size === 0) {
		console.error(
			"[check-published] The probe loaded no dependencies, so it resolved nothing.",
		);
		return 1;
	}

	// Both run before either verdict, so one failure does not hide the other.
	const oursCode = reportOurs(ours);
	const flagsCode = report(packages);

	return Math.max(oursCode, flagsCode);
}

process.exit(main());
