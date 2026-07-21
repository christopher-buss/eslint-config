/**
 * Internal helper process for {@link file://./ignored.ts}. Loads the consumer's
 * resolved ESLint config once and writes the ignored subset of a target list to
 * a JSON file.
 *
 * Run as a child rather than in-process for two reasons: `isPathIgnored` is
 * async while `plan` is synchronous end to end, and loading a consumer's flat
 * config pulls their whole plugin tree (and jiti) into memory — 6-10s and
 * several hundred MB in a large project, neither of which should outlive the
 * one query the runner needs.
 *
 * Invoked as `node <this file> <cwd> <outFile>` with the JSON target array on
 * stdin.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** The subset of the `ESLint` class this helper uses. */
interface EslintLike {
	isPathIgnored: (filePath: string) => Promise<boolean>;
}

/** The subset of the `eslint` module namespace this helper uses. */
interface EslintModule {
	ESLint: new (options: { cwd: string }) => EslintLike;
}

/**
 * Load the ESLint the consumer's config will be linted with: their own
 * installation, resolved from `cwd`, falling back to the one resolvable from
 * this file (the hoisted peer dependency) when `cwd` has no `node_modules` of
 * its own — the case in the fixture-based tests.
 *
 * @param cwd - The consumer project root.
 * @returns The `eslint` module namespace.
 * @rejects {Error} When ESLint cannot be resolved from either location.
 */
async function loadEslint(cwd: string): Promise<EslintModule> {
	const require = createRequire(path.join(cwd, "noop.js"));
	let entry: string;
	try {
		entry = require.resolve("eslint");
	} catch {
		return import("eslint");
	}

	const namespace = (await import(pathToFileURL(entry).href)) as
		| EslintModule
		| { default: EslintModule };
	return "ESLint" in namespace ? namespace : namespace.default;
}

async function main(): Promise<void> {
	const [cwd, outFile] = process.argv.slice(2);
	if (cwd === undefined || outFile === undefined) {
		throw new Error("usage: node ignored-child <cwd> <outFile> (targets on stdin)");
	}

	const targets = JSON.parse(fs.readFileSync(0, "utf8")) as Array<string>;
	const { ESLint } = await loadEslint(cwd);
	const eslint = new ESLint({ cwd });

	const ignored: Array<string> = [];
	for (const target of targets) {
		if (await eslint.isPathIgnored(target)) {
			ignored.push(target);
		}
	}

	fs.writeFileSync(outFile, JSON.stringify(ignored));
}

void main().catch(() => {
	// The parent treats a non-zero exit as "no filtering"; nothing to report.
	process.exitCode = 1;
});
