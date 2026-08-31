/**
 * Guards `pnpm-plugin/extensions.mjs` against drift: every module specifier an
 * installed package's shipped declarations import must be declared by that
 * package or covered by a table entry.
 *
 * Deliberately layout-independent. Pnpm disables `enableGlobalVirtualStore` in
 * CI, where the hoisted store hides every under-declaration, so a type-checker
 * probe would find nothing there and the guard would rot. Reading the
 * declarations statically instead gives the same answer under either layout.
 *
 * Runs under plain node (via `pnpm check:extensions`).
 */
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { packageExtensions } from "../pnpm-plugin/extensions.mjs";
import { isRecord } from "../src/guards.ts";
import type { JsonObject } from "../src/guards.ts";

/**
 * Every declaration extension whose imports are part of a package's surface.
 */
const DECLARATION_PATTERN = /\.d\.(?:[cm])?ts$/u;

/** Directories that never hold shipped declarations, skipped while walking. */
const SKIPPED_DIRECTORIES = new Set([".bin", ".git", "node_modules"]);

const MANIFEST_FILE = "package.json";

/**
 * The fields a package's declarations may rely on. `devDependencies` is
 * excluded: it is not installed for consumers, so an import satisfied only by
 * one is exactly the breakage this table repairs.
 */
const DEPENDENCY_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];

const BUILTINS = new Set([
	...builtinModules,
	...builtinModules.map((name) => `node:${name}`),
	// Every TypeScript project consuming this preset has the Node types, and
	// `types: ["node"]` loads them globally rather than through the importer.
	"@types/node",
]);

const scriptPath = fileURLToPath(import.meta.url);
const rootDirectory = path.resolve(path.dirname(scriptPath), "..");

/**
 * Locates an installed dependency the way a resolver would: in a nested
 * `node_modules` first, then among the declaring package's siblings — which is
 * where pnpm links a package's own dependencies under either store layout. A
 * scoped package sits one directory deeper, so its siblings are one level
 * further up.
 *
 * @param directory - The directory of the package that declares it.
 * @param declaredBy - The name of that package.
 * @param name - The dependency to locate.
 * @returns The real directory holding it, or undefined when it is not
 *   installed.
 */
export function resolveDependency(
	directory: string,
	declaredBy: string,
	name: string,
): string | undefined {
	const siblings = path.resolve(directory, declaredBy.startsWith("@") ? "../.." : "..");
	const candidates = [path.join(directory, "node_modules", ...name.split("/"))];
	// Only for a package that actually sits in a `node_modules`: the walk
	// starts at the project root, whose own parent is not one.
	if (path.basename(siblings) === "node_modules") {
		candidates.push(path.join(siblings, ...name.split("/")));
	}

	for (const candidate of candidates) {
		try {
			const real = realpathSync(candidate);
			if (statSync(real).isDirectory()) {
				return real;
			}
		} catch {
			continue;
		}
	}

	return undefined;
}

/**
 * Walks the dependency graph reachable from this package's own `dependencies`
 * and `peerDependencies` — the packages whose declarations end up in a
 * consumer's program. Development-only packages are left out: an
 * under-declaration there never reaches a consumer, so it is not ours to
 * repair.
 *
 * Following the links rather than listing `node_modules/.pnpm` keeps the walk
 * faithful to what a resolver sees, which under `enableGlobalVirtualStore` is
 * the store directory rather than anything inside the project.
 *
 * @returns Each reachable package name mapped to its real directory. A package
 *   installed at several versions is visited once; the table is keyed by name,
 *   so a per-version scan would only produce duplicate findings.
 */
export function findPublishedDependencies(): Map<string, string> {
	const manifest = readManifest(rootDirectory);
	if (manifest === undefined) {
		throw new Error("Unreadable root package.json.");
	}

	const rootName = typeof manifest["name"] === "string" ? manifest["name"] : "";
	const reachable = new Map<string, string>();
	const queue = [...declaredPackages(manifest)]
		.filter((name) => name !== rootName)
		.map((name) => {
			return { name, declaredBy: rootName, from: rootDirectory };
		});

	while (queue.length > 0) {
		const next = queue.pop();
		if (next === undefined || reachable.has(next.name)) {
			continue;
		}

		const directory = resolveDependency(next.from, next.declaredBy, next.name);
		if (directory === undefined) {
			continue;
		}

		reachable.set(next.name, directory);

		const dependencyManifest = readManifest(directory) ?? {};
		for (const name of declaredPackages(dependencyManifest)) {
			queue.push({ name, declaredBy: next.name, from: directory });
		}
	}

	return reachable;
}

/**
 * Parses the manifest of an installed package.
 *
 * @param directory - The package directory.
 * @returns The parsed manifest, or undefined when there is no readable one.
 */
function readManifest(directory: string): JsonObject | undefined {
	let manifest: unknown;
	try {
		manifest = JSON.parse(readFileSync(path.join(directory, MANIFEST_FILE), "utf8"));
	} catch {
		return undefined;
	}

	return isRecord(manifest) ? manifest : undefined;
}

/**
 * Reads every package a manifest declares across {@link DEPENDENCY_FIELDS}.
 *
 * @param manifest - A parsed package manifest.
 * @returns The declared package names, including the package's own name.
 */
function declaredPackages(manifest: JsonObject): Set<string> {
	const declared = new Set<string>();

	for (const field of DEPENDENCY_FIELDS) {
		const value = manifest[field];
		if (isRecord(value)) {
			for (const name of Object.keys(value)) {
				declared.add(name);
			}
		}
	}

	const { name } = manifest;
	if (typeof name === "string") {
		declared.add(name);
	}

	return declared;
}

/**
 * Reduces a module specifier to the package it resolves from, dropping any
 * subpath (`@typescript-eslint/utils/ts-eslint` → `@typescript-eslint/utils`).
 *
 * @param specifier - A bare module specifier.
 * @returns The portion of it that names an installed package.
 */
function packageNameOf(specifier: string): string {
	const segments = specifier.split("/");
	return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] ?? specifier);
}

/**
 * The other name that satisfies an import of this package: `foo` and
 * `@types/foo` stand in for each other, since a package either ships its own
 * declarations or has them supplied by DefinitelyTyped.
 *
 * @param name - The name written in the import.
 * @returns The name that also satisfies it.
 */
function alternateName(name: string): string {
	return name.startsWith("@types/") ? name.slice("@types/".length) : `@types/${name}`;
}

/**
 * Collects every declaration file a package ships, ignoring any nested
 * `node_modules`.
 *
 * @param directory - The directory to walk.
 * @param found - The accumulator carried through the recursion.
 * @returns The declaration file paths.
 */
function collectDeclarations(directory: string, found: Array<string> = []): Array<string> {
	let entries;
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return found;
	}

	for (const entry of entries) {
		if (SKIPPED_DIRECTORIES.has(entry.name)) {
			continue;
		}

		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			collectDeclarations(entryPath, found);
		} else if (DECLARATION_PATTERN.test(entry.name)) {
			found.push(entryPath);
		}
	}

	return found;
}

/**
 * Extracts the packages a declaration file references, from both its import
 * specifiers and its triple-slash type references. TypeScript's own
 * pre-processor is used rather than a pattern: specifiers inside JSDoc code
 * examples otherwise read as real imports.
 *
 * @param file - The declaration file to read.
 * @returns The referenced package names.
 */
function referencedPackages(file: string): Array<string> {
	const info = ts.preProcessFile(readFileSync(file, "utf8"), true, true);
	const referenced: Array<string> = [];

	for (const { fileName } of info.importedFiles) {
		// `#` starts a subpath import, resolved through the package's own
		// `imports` field rather than through a dependency.
		if (!fileName.startsWith(".") && !fileName.startsWith("/") && !fileName.startsWith("#")) {
			referenced.push(packageNameOf(fileName));
		}
	}

	// A `/// <reference types="estree" />` is satisfied by the corresponding
	// `@types` package, which is what has to be declared.
	for (const { fileName } of info.typeReferenceDirectives) {
		referenced.push(fileName.startsWith("@types/") ? fileName : `@types/${fileName}`);
	}

	return referenced;
}

/** Whether a package supplies declarations, keyed by its real directory. */
const declarationSupport = new Map<string, boolean>();

/**
 * Diffs what each package imports against what the table accounts for.
 *
 * @param published - Each reachable package name mapped to its directory.
 * @returns The uncovered imports, and the entries no longer needed.
 */
/** Imports no table entry covers, and table entries nothing needs. */
interface CoverageAudit {
	uncovered: Map<string, Array<string>>;
	unused: Map<string, Array<string>>;
}

/**
 * Whether an installed package supplies declarations of its own. One that does
 * not is satisfied only by its `@types` counterpart, so declaring the runtime
 * package leaves the import's types just as unresolved.
 *
 * @param directory - The real directory holding the package.
 * @returns Whether importing it yields types.
 */
function shipsDeclarations(directory: string): boolean {
	const cached = declarationSupport.get(directory);
	if (cached !== undefined) {
		return cached;
	}

	const manifest = readManifest(directory) ?? {};
	// A `types` condition can sit at any depth of a subpath map, so the whole
	// field is searched rather than walked.
	const ships =
		typeof manifest["types"] === "string" ||
		typeof manifest["typings"] === "string" ||
		JSON.stringify(manifest["exports"] ?? null).includes('"types"') ||
		collectDeclarations(directory).length > 0;

	declarationSupport.set(directory, ships);
	return ships;
}

/**
 * The provider a referenced specifier needs but the package does not declare.
 *
 * A declared runtime package only settles the import when it ships
 * declarations. When it does not, the types can come from `@types/<name>`
 * alone, which is the case a bare runtime declaration silently hides: the
 * import resolves, and its type is still `any`.
 *
 * @param directory - The directory of the package doing the importing.
 * @param declaredBy - The name of that package.
 * @param declared - Everything it declares.
 * @param name - The referenced package name.
 * @returns The provider to add, or undefined when the reference is already
 *   satisfied.
 */
function missingProvider(
	directory: string,
	declaredBy: string,
	declared: Set<string>,
	name: string,
): string | undefined {
	if (BUILTINS.has(name)) {
		return undefined;
	}

	// A `@types` package is nothing but declarations, and a triple-slash
	// reference to one is also satisfied by a runtime package that carries its
	// own.
	if (name.startsWith("@types/")) {
		return declared.has(name) || declared.has(alternateName(name)) ? undefined : name;
	}

	if (declared.has(alternateName(name))) {
		return undefined;
	}

	if (!declared.has(name)) {
		return name;
	}

	const resolved = resolveDependency(directory, declaredBy, name);
	// An unresolvable declaration is an unfulfilled optional peer or similar:
	// there is nothing installed to inspect, and nothing this table repairs.
	if (resolved === undefined || shipsDeclarations(resolved)) {
		return undefined;
	}

	return alternateName(name);
}

/**
 * Reads the specifiers a package's declarations reference but never declare.
 *
 * @param directory - The installed package directory.
 * @param declaredBy - The name of the package in that directory.
 * @returns The undeclared package names, or undefined when the directory holds
 *   no readable manifest.
 */
function findUndeclared(directory: string, declaredBy: string): Set<string> | undefined {
	const manifest = readManifest(directory);
	if (manifest === undefined) {
		return undefined;
	}

	const declared = declaredPackages(manifest);
	const undeclared = new Set<string>();

	for (const file of collectDeclarations(directory)) {
		for (const name of referencedPackages(file)) {
			const missing = missingProvider(directory, declaredBy, declared, name);
			if (missing !== undefined) {
				undeclared.add(missing);
			}
		}
	}

	return undeclared;
}

/**
 * Flattens the table into what each entry accounts for.
 *
 * @returns Each extended package mapped to its providers and ignored
 *   specifiers.
 */
function tableCoverage(): Map<string, Array<string>> {
	const coverage = new Map<string, Array<string>>();

	for (const extension of packageExtensions) {
		coverage.set(extension.name, [
			...Object.keys(extension.dependencies ?? {}),
			...Object.keys(extension.peerDependencies ?? {}),
			...(extension.ignore ?? []),
		]);
	}

	return coverage;
}

function auditCoverage(published: Map<string, string>): CoverageAudit {
	const coverage = tableCoverage();
	const uncovered = new Map<string, Array<string>>();
	const unused = new Map<string, Array<string>>();

	for (const [name, directory] of published) {
		const undeclared = findUndeclared(directory, name);
		if (undeclared === undefined) {
			continue;
		}

		const entries = coverage.get(name) ?? [];
		// An entry declaring `@types/estree` covers an `estree` import, which
		// is what resolves to it.
		const covered = new Set(entries.flatMap((entry) => [entry, alternateName(entry)]));

		const missing = [...undeclared].filter((entry) => !covered.has(entry)).toSorted();
		if (missing.length > 0) {
			uncovered.set(name, missing);
		}

		const stale = entries
			.filter((entry) => !undeclared.has(entry) && !undeclared.has(alternateName(entry)))
			.toSorted();
		if (stale.length > 0) {
			unused.set(name, stale);
		}
	}

	return { uncovered, unused };
}

/**
 * Reports every under-declared import the table does not account for.
 *
 * @returns The process exit code.
 */
function main(): number {
	const published = findPublishedDependencies();
	if (published.size === 0) {
		console.error("[check-extensions] No dependencies resolved. Run `pnpm install` first.");
		return 1;
	}

	const { uncovered, unused } = auditCoverage(published);

	// Reported rather than fatal: an entry covers every version of a package,
	// not just the one this lockfile happens to install.
	for (const [name, entries] of unused) {
		console.warn(`[check-extensions] ${name} no longer needs: ${entries.join(", ")}`);
	}

	for (const [name, entries] of uncovered) {
		console.error(`[check-extensions] ${name} imports undeclared: ${entries.join(", ")}`);
	}

	if (uncovered.size > 0) {
		console.error(
			`[check-extensions] ${uncovered.size} package(s) import types they do not declare. ` +
				"Add them to pnpm-plugin/extensions.mjs, or list them under `ignore` when the " +
				"declarations are not part of the package's type surface.",
		);
		return 1;
	}

	console.log(
		`[check-extensions] ${published.size} published dependencies checked; ` +
			`all ${packageExtensions.length} table entries hold.`,
	);

	return 0;
}

// Exports the walk for `test/package-extensions.spec.ts`, so only report when
// run as the entry point.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === scriptPath) {
	process.exit(main());
}
