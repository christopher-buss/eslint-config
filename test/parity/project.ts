/**
 * Scratch projects for the formatter parity suite.
 *
 * Projects live in the system temp directory: inside this repository they
 * would sit under an ignored path, and oxfmt skips ignored files.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The repository root. */
export const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");

/** Committed parity inputs and expected outputs. */
export const PARITY_FIXTURES = path.join(PROJECT_ROOT, "fixtures", "parity");

const ESLINT_URL = sourceUrl("index.ts");
const OXFMT_URL = sourceUrl("oxfmt/index.ts");
const OXLINT_URL = sourceUrl("oxlint/index.ts");
const UTILS_URL = sourceUrl("utils.ts");

/** Files that configure the run rather than being formatted by it. */
const CONFIG_FILES = new Set(["eslint.config.ts", "oxfmt.config.ts", "oxlint.config.ts"]);

const BASE_OPTIONS = `{
	isAgent: false,
	isInEditor: false,
	pnpm: false,
	spellCheck: false,
	typescript: { typeAware: false },
}`;

/** The formatter mode under test. */
export type Mode = "eslint" | "standalone";

/** One parity scenario. */
export interface Scenario {
	/** Unique name; also the overlay and output directory name. */
	name: string;
	/**
	 * Copy the shared corpus (`fixtures/parity/corpus`) into the project.
	 * Default `true`.
	 */
	corpus?: boolean;
	/** Files converted to CRLF line endings after the copy. */
	crlf?: Array<string>;
	/**
	 * Subfolder of the project both modes run from. The ESLint config sits
	 * there, and the corpus is copied there.
	 */
	cwd?: string;
	/**
	 * Source of the factory options object, without `formatter`. Spread over
	 * the suite's base options. Also passed to the oxlint factory when
	 * `oxlint` is set.
	 */
	eslint: string;
	/**
	 * Source of further ESLint config items, comma-separated, passed after the
	 * options. `parserPlain` is in scope.
	 */
	eslintConfigs?: string;
	/** Files that exist only in eslint mode (an `.oxfmtrc.json`, say). */
	eslintOnly?: Array<string>;
	/** Files written in both modes, by relative path. */
	files?: Record<string, string>;
	/** Make the project a git repository. */
	git?: boolean;
	/** Copy this directory instead of the corpus (`fixtures/input`, say). */
	input?: string;
	/**
	 * Files where the modes are known to differ. The standalone tree is then
	 * pinned in `<name>.standalone.txt` instead of compared to eslint mode.
	 */
	knownDifference?: { files: Array<string>; reason: string };
	/**
	 * Source of the `isentinelOxfmt` options object `oxfmt.config.ts` passes.
	 * `null` means standalone runs no oxfmt. Default `{}`.
	 */
	oxfmt?: null | string;
	/** Write `oxfmt.config.ts` in eslint mode too. */
	oxfmtInBoth?: boolean;
	/** Run oxlint (hybrid mode) before ESLint in each round. */
	oxlint?: boolean;
	/** Files written only in standalone mode, by relative path. */
	standaloneFiles?: Record<string, string>;
	/** Builds TypeScript programs; such scenarios run one at a time. */
	typeAware?: boolean;
	/** The preset may warn (the options it tests trigger a warning). */
	warns?: boolean;
}

/** The files of a project tree, by POSIX relative path. */
export type Tree = Map<string, string>;

/**
 * The files whose content differs between two trees.
 *
 * @param before - The earlier tree.
 * @param after - The later tree.
 * @returns The changed paths, sorted.
 */
export function changedFiles(before: Tree, after: Tree): Array<string> {
	const names = new Set([...before.keys(), ...after.keys()]);
	return [...names].filter((name) => before.get(name) !== after.get(name)).sort();
}

/**
 * Create a scenario's scratch project for one mode.
 *
 * @param scenario - What to set up and run.
 * @param mode - Which formatter setup to write.
 * @returns The project root.
 */
export async function prepareProject(scenario: Scenario, mode: Mode): Promise<string> {
	const root = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), `isentinel-parity-${scenario.name}-`)),
	);
	const runDirectory = path.join(root, scenario.cwd ?? ".");

	await copyInputs(scenario, root, runDirectory);
	await writeConfigs(scenario, mode, root, runDirectory);

	if (mode === "standalone") {
		const eslintOnly = scenario.eslintOnly ?? [];
		for (const file of eslintOnly) {
			await fs.rm(path.join(root, file), { force: true });
		}

		await writeFiles(root, scenario.standaloneFiles);
	}

	return root;
}

/**
 * A path in POSIX form.
 *
 * @param file - A native path.
 * @returns The path with `/` separators.
 */
export function toPosix(file: string): string {
	return file.split(path.sep).join("/");
}

/**
 * Read every file under a directory, skipping `.git` and ESLint caches.
 *
 * @param root - The directory.
 * @returns The files by POSIX relative path, sorted.
 */
export async function readTree(root: string): Promise<Tree> {
	const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
	const files: Array<[string, string]> = [];
	for (const entry of entries) {
		const relative = toPosix(path.relative(root, path.join(entry.parentPath, entry.name)));
		const isSkipped =
			path.posix.basename(relative).startsWith(".eslintcache") ||
			relative.startsWith(".git/");
		if (!isSkipped && entry.isFile()) {
			files.push([relative, await fs.readFile(path.join(root, relative), "utf8")]);
		}
	}

	return new Map(files.sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * One text file for a whole tree, so a scenario's expected output is one
 * committed file. Contents are kept byte for byte, line endings included.
 *
 * @param tree - A settled tree.
 * @returns Each file under a `=== path ===` header, in path order.
 */
export function serializeTree(tree: Tree): string {
	return Array.from(tree, ([file, contents]) => `=== ${file} ===\n${contents}`).join("\n");
}

/**
 * Drop the files that configure a mode, so both modes' trees compare.
 *
 * @param tree - A settled tree.
 * @param scenario - What to set up and run.
 * @param mode - Which setup produced the tree.
 * @returns The tree without config files.
 */
export function stripConfigFiles(tree: Tree, scenario: Scenario, mode: Mode): Tree {
	const modeOnly =
		mode === "eslint"
			? (scenario.eslintOnly ?? [])
			: Object.keys(scenario.standaloneFiles ?? {});
	const excluded = new Set(modeOnly);
	return new Map(
		[...tree].filter(([name]) => {
			return !CONFIG_FILES.has(path.posix.basename(name)) && !excluded.has(name);
		}),
	);
}

async function writeFiles(root: string, files: Record<string, string> = {}): Promise<void> {
	for (const [file, contents] of Object.entries(files)) {
		await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
		await fs.writeFile(path.join(root, file), contents);
	}
}

async function exists(target: string): Promise<boolean> {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

async function copyInputs(scenario: Scenario, root: string, runDirectory: string): Promise<void> {
	if (scenario.input !== undefined) {
		await fs.cp(path.join(PROJECT_ROOT, scenario.input), runDirectory, { recursive: true });
	} else if (scenario.corpus !== false) {
		await fs.cp(path.join(PARITY_FIXTURES, "corpus"), runDirectory, { recursive: true });
	}

	const overlay = path.join(PARITY_FIXTURES, "scenarios", scenario.name);
	if (await exists(overlay)) {
		await fs.cp(overlay, root, { recursive: true });
	}

	await writeFiles(root, scenario.files);

	const crlfFiles = scenario.crlf ?? [];
	for (const file of crlfFiles) {
		const target = path.join(runDirectory, file);
		const contents = await fs.readFile(target, "utf8");
		await fs.writeFile(target, contents.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"));
	}
}

function configModule(imports: Array<string>, expression: string): string {
	return `${imports.join("\n")}\n\nexport default ${expression};\n`;
}

async function writeOxfmtConfig(root: string, options = "{}"): Promise<void> {
	// What the setup wizard writes, plus the scenario's options.
	await fs.writeFile(
		path.join(root, "oxfmt.config.ts"),
		configModule(
			[`import { isentinelOxfmt } from "${OXFMT_URL}";`],
			`isentinelOxfmt({ cwd: import.meta.dirname, ...${options} })`,
		),
	);
}

async function writeConfigs(
	scenario: Scenario,
	mode: Mode,
	root: string,
	runDirectory: string,
): Promise<void> {
	const options = `{ ...${BASE_OPTIONS}, ...${scenario.eslint}, formatter: "${mode}" }`;
	await fs.writeFile(
		path.join(runDirectory, "eslint.config.ts"),
		configModule(
			[
				`import { isentinel } from "${ESLINT_URL}";`,
				`import { parserPlain } from "${UTILS_URL}";`,
			],
			`isentinel(${options}, ${scenario.eslintConfigs ?? ""})`,
		),
	);

	if (scenario.oxlint === true) {
		await fs.writeFile(
			path.join(runDirectory, "oxlint.config.ts"),
			configModule(
				[`import { isentinel } from "${OXLINT_URL}";`],
				`isentinel({ name: "parity", ...${options} })`,
			),
		);
	}

	if (scenario.oxfmt !== null && (mode === "standalone" || scenario.oxfmtInBoth === true)) {
		await writeOxfmtConfig(root, scenario.oxfmt);
	}
}

function sourceUrl(file: string): string {
	return pathToFileURL(path.join(PROJECT_ROOT, "src", file)).href;
}
