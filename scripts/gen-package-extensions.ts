/**
 * Renders `pnpm-plugin/extensions.mjs` into the `packageExtensions` block of
 * `pnpm-workspace.yaml`, so this repository's own install needs no pnpmfile.
 *
 * Native `packageExtensions` runs through the same `readPackage` machinery the
 * plugin hooks by hand, with the semantics the plugin reimplements:
 * `createPackageExtender` spreads each extended field as
 * `{ ...extension, ...manifest }`, so a package's own declarations win and an
 * upstream fix takes effect without this table having to be updated first.
 *
 * Only this repository benefits. `packageExtensions` cannot be published, so
 * consumers still get the hook from the plugin as a config dependency.
 *
 * Run by `pnpm gen`. With `--check` it reports drift instead of writing, which
 * is what `pnpm check:extensions` uses to catch a table edited without
 * regenerating.
 */
import fs from "node:fs/promises";
import process from "node:process";
import { parsePnpmWorkspaceYaml } from "pnpm-workspace-yaml";
import type { PnpmWorkspaceYaml } from "pnpm-workspace-yaml";

import { packageExtensions } from "../pnpm-plugin/extensions.mjs";
import { isRecord } from "../src/guards.ts";

/** The fields pnpm reads from a `packageExtensions` entry. */
interface RenderedExtension {
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional: boolean }>;
}

const WORKSPACE_FILE = new URL("../pnpm-workspace.yaml", import.meta.url);

const EXTENSIONS_KEY = "packageExtensions";

const collator = new Intl.Collator();

/**
 * The selector pnpm matches an entry against. A `fixedIn` becomes a semver
 * range so the repair stops applying once upstream ships the declarations.
 *
 * Ranges are tested with `semver.satisfies`, which excludes prereleases unless
 * the range names one. A prerelease below `fixedIn` is therefore left
 * unextended here, where the plugin's own comparison would extend it. No entry
 * currently sets `fixedIn`, so nothing relies on the difference.
 *
 * @param extension - The entry to render.
 * @returns Its `packageExtensions` key.
 */
function selectorFor({ name, fixedIn }: (typeof packageExtensions)[number]): string {
	return fixedIn === undefined ? name : `${name}@<${fixedIn}`;
}

/**
 * Renders the table into the shape pnpm expects. Entries that only carry
 * `ignore` are dropped: they exist to tell the check script an import is
 * accounted for, and inject nothing.
 *
 * @returns The `packageExtensions` block.
 */
function renderExtensions(): Record<string, RenderedExtension> {
	const rendered: Record<string, RenderedExtension> = {};

	for (const extension of packageExtensions) {
		const entry: RenderedExtension = {};

		if (extension.dependencies !== undefined) {
			entry.dependencies = { ...extension.dependencies };
		}

		if (extension.peerDependencies !== undefined) {
			entry.peerDependencies = { ...extension.peerDependencies };
			entry.peerDependenciesMeta = Object.fromEntries(
				Object.keys(extension.peerDependencies).map(
					(name) => [name, { optional: true }] as const,
				),
			);
		}

		if (Object.keys(entry).length > 0) {
			rendered[selectorFor(extension)] = entry;
		}
	}

	return rendered;
}

/**
 * Rewrites a value with every object key sorted, so two blocks that differ only
 * in key order compare equal.
 *
 * @param value - The value to rewrite.
 * @returns The same value with sorted keys throughout.
 */
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonical);
	}

	if (typeof value !== "object" || value === null) {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value)
			.toSorted(([left], [right]) => collator.compare(left, right))
			.map(([key, nested]) => [key, canonical(nested)] as const),
	);
}

/**
 * Whether a document already holds exactly the rendered block, whatever order
 * its keys happen to sit in.
 *
 * @param workspace - The parsed workspace file.
 * @param desired - The block it should hold.
 * @returns Whether the two agree.
 */
function isRendered(
	workspace: PnpmWorkspaceYaml,
	desired: Record<string, RenderedExtension>,
): boolean {
	// `toJSON` is typed `any`, so it is narrowed before anything reads a key.
	const document: unknown = workspace.getDocument().toJSON();
	const current = isRecord(document) ? document[EXTENSIONS_KEY] : undefined;
	return JSON.stringify(canonical(current)) === JSON.stringify(canonical(desired));
}

/**
 * Replaces the block and writes the file back.
 *
 * @param workspace - The parsed workspace file.
 * @param desired - The block to write.
 * @returns The process exit code.
 */
async function writeExtensions(
	workspace: PnpmWorkspaceYaml,
	desired: Record<string, RenderedExtension>,
): Promise<number> {
	// Not `setPath`: it refuses to replace a key that already holds a
	// collection, reporting a change it never made. Setting the key on the
	// document replaces the value in place, which also keeps the block where
	// `yaml/sort-keys` expects it.
	workspace.getDocument().set(EXTENSIONS_KEY, desired);
	const updated = workspace.toString();

	if (!isRendered(parsePnpmWorkspaceYaml(updated), desired)) {
		console.error(
			"[gen-extensions] Refusing to write: the rendered block did not survive a " +
				"round-trip through pnpm-workspace.yaml.",
		);
		return 1;
	}

	await fs.writeFile(WORKSPACE_FILE, updated);

	console.log(
		`[gen-extensions] Wrote ${Object.keys(desired).length} extended packages to ` +
			"pnpm-workspace.yaml. Run `pnpm install` to apply them.",
	);

	return 0;
}

/**
 * Renders the table into `pnpm-workspace.yaml`, or reports the drift when
 * checking.
 *
 * @returns The process exit code.
 */
async function main(): Promise<number> {
	const checking = process.argv.includes("--check");
	const workspace = parsePnpmWorkspaceYaml(await fs.readFile(WORKSPACE_FILE, "utf8"));
	const desired = renderExtensions();

	if (isRendered(workspace, desired)) {
		if (!checking) {
			const count = Object.keys(desired).length;
			console.log(
				`[gen-extensions] pnpm-workspace.yaml already lists all ${count} extended packages.`,
			);
		}

		return 0;
	}

	if (checking) {
		console.error(
			"[gen-extensions] pnpm-workspace.yaml is out of sync with " +
				"pnpm-plugin/extensions.mjs. Run `pnpm gen`, then `pnpm install` to " +
				"pick up the change.",
		);
		return 1;
	}

	return writeExtensions(workspace, desired);
}

process.exit(await main());
