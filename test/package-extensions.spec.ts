import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import type { TestContext } from "vitest";

import {
	applyExtensions,
	extendManifest,
	packageExtensions,
	publishedExtensions,
} from "../pnpm-plugin/extensions.mjs";
import {
	collectSurface,
	findPublishedDependencies,
	resolveDependency,
} from "../scripts/check-package-extensions.ts";

const published = findPublishedDependencies();

/**
 * Every provider a table entry injects, paired with the package it repairs and
 * that package's installed directory. Entries whose package this project does
 * not install have nothing to resolve against and are left out.
 */
const providers = packageExtensions.flatMap((extension) => {
	const directory = published.get(extension.name);
	if (directory === undefined) {
		return [];
	}

	return [
		...Object.keys(extension.dependencies ?? {}),
		...Object.keys(extension.peerDependencies ?? {}),
	].map((provider) => {
		return { dependent: extension.name, directory, provider };
	});
});

/** Each table entry with the declarations it repairs or accounts for. */
const EXTENSION_INJECTIONS = packageExtensions.map((extension) => {
	return {
		name: extension.name,
		injected: [
			...Object.keys(extension.dependencies ?? {}),
			...Object.keys(extension.peerDependencies ?? {}),
			...(extension.ignore ?? []),
		],
	};
});

describe("packageExtensions", () => {
	it("has one entry per package, sorted by name", ({ expect }) => {
		expect.assertions(2);

		const names = packageExtensions.map((extension) => extension.name);
		const unique = new Set(names);

		expect(unique.size).toBe(names.length);
		expect(names).toStrictEqual(names.toSorted());
	});

	it.for(EXTENSION_INJECTIONS)("gives $name something to inject", ({ injected }, { expect }) => {
		expect.assertions(1);

		expect(injected.length).toBeGreaterThan(0);
	});

	// An injected declaration that does not resolve leaves the import it
	// repairs unresolved, and the type an error type all the same.
	it.for(providers)(
		"resolves $provider from $dependent",
		({ dependent, directory, provider }, { expect }) => {
			expect.assertions(1);

			expect(resolveDependency(directory, dependent, provider)).toBeDefined();
		},
	);
});

describe("applyExtensions", () => {
	it("injects declarations as optional peers", ({ expect }) => {
		expect.assertions(2);

		const manifest = applyExtensions({
			name: "eslint-flat-config-utils",
			version: "3.2.0",
		});

		expect(manifest.peerDependencies).toStrictEqual({ eslint: "*" });
		expect(manifest.peerDependenciesMeta).toStrictEqual({ eslint: { optional: true } });
	});

	it("leaves an existing declaration untouched", ({ expect }) => {
		expect.assertions(2);

		const manifest = applyExtensions({
			name: "eslint-flat-config-utils",
			dependencies: { eslint: "^10.0.0" },
			version: "3.2.0",
		});

		expect(manifest.dependencies).toStrictEqual({ eslint: "^10.0.0" });
		expect(manifest.peerDependencies).toBeUndefined();
	});

	it("returns unlisted manifests unchanged", ({ expect }) => {
		expect.assertions(1);

		expect(applyExtensions({ name: "not-in-the-table", version: "1.0.0" })).toStrictEqual({
			name: "not-in-the-table",
			version: "1.0.0",
		});
	});

	// The shipped hook carries the whole table but applies only the entries a
	// consumer's program loads. Everything else repairs a package ESLint loads
	// at runtime, where resolution was never broken.
	it("leaves an entry no consumer loads alone", ({ expect }) => {
		expect.assertions(2);

		const names = publishedExtensions.map((extension) => extension.name);

		expect(names).not.toContain("eslint-plugin-jsdoc");
		expect(applyExtensions({ name: "eslint-plugin-jsdoc", version: "63.2.0" })).toStrictEqual({
			name: "eslint-plugin-jsdoc",
			version: "63.2.0",
		});
	});
});

describe("publishedExtensions", () => {
	it("is the flagged subset of the table", ({ expect }) => {
		expect.assertions(2);

		const flagged = packageExtensions.filter((extension) => extension.consumerFacing === true);

		expect(publishedExtensions).toStrictEqual(flagged);
		expect(publishedExtensions.length).toBeLessThan(packageExtensions.length);
	});

	it("injects something for every entry it carries", ({ expect }) => {
		expect.assertions(1);

		const providerCounts = publishedExtensions.map((extension) => {
			return Object.keys({ ...extension.dependencies, ...extension.peerDependencies }).length;
		});

		expect(providerCounts.every((count) => count > 0)).toBe(true);
	});
});

describe("collectSurface", () => {
	/**
	 * Writes a package to a fresh directory, removed when the test finishes.
	 *
	 * @param files - Each file's path relative to the package, and its text.
	 * @param onTestFinished - The test's cleanup hook.
	 * @returns The package directory.
	 */
	function writePackage(
		files: Record<string, string>,
		onTestFinished: TestContext["onTestFinished"],
	): string {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "isentinel-surface-"));
		onTestFinished(() => {
			fs.rmSync(directory, { force: true, recursive: true });
		});

		for (const [file, text] of Object.entries(files)) {
			const target = path.join(directory, file);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, text);
		}

		return directory;
	}

	/**
	 * Lists the surface as paths relative to the package, sorted.
	 *
	 * @param directory - The package directory.
	 * @param manifest - Its manifest.
	 * @returns The relative paths.
	 */
	function surfaceOf(directory: string, manifest: Record<string, unknown>): Array<string> {
		return collectSurface(directory, manifest)
			.map((file) => path.relative(directory, file).replaceAll("\\", "/"))
			.toSorted();
	}

	const shipped = {
		"dist/a.d.ts": "export type A = string;",
		"dist/b/index.d.ts": "export type B = number;",
		"dist/cjs.d.cts": "export type C = bigint;",
		"dist/esm.d.mts": "export type E = boolean;",
		"dist/globals.d.ts": "declare const g: string;",
		"dist/index.d.ts": [
			'/// <reference path="./globals.d.ts" />',
			'export type { A } from "./a.js";',
			'export type { B } from "./b";',
		].join("\n"),
		"dist/internal.d.ts": 'import type { Node } from "estree";',
		"dist/legacy.d.ts": "export type L = symbol;",
		"dist/private.d.ts": "export type P = null;",
	};

	it("follows only what the entry points reach", ({ expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = writePackage(shipped, onTestFinished);

		expect(
			surfaceOf(directory, {
				exports: { ".": { import: "./dist/esm.mjs", types: "./dist/index.d.ts" } },
			}),
		).toStrictEqual([
			"dist/a.d.ts",
			"dist/b/index.d.ts",
			"dist/esm.d.mts",
			"dist/globals.d.ts",
			"dist/index.d.ts",
		]);
	});

	it.for<[string, Record<string, unknown>, string]>([
		["a string exports", { exports: "./dist/index.js" }, "dist/a.d.ts"],
		[
			"a require condition",
			{ exports: { ".": { require: "./dist/cjs.cjs" } } },
			"dist/cjs.d.cts",
		],
		[
			"a default condition",
			{ exports: { ".": { default: "./dist/esm.mjs" } } },
			"dist/esm.d.mts",
		],
		[
			"typings",
			{ exports: "./dist/esm.mjs", typings: "./dist/legacy.d.ts" },
			"dist/legacy.d.ts",
		],
		["main", { exports: "./dist/esm.mjs", main: "./dist/legacy.js" }, "dist/legacy.d.ts"],
		[
			"an imports target",
			{ exports: "./dist/esm.mjs", imports: { "#private": "./dist/private.js" } },
			"dist/private.d.ts",
		],
	])("reaches the surface from %s", ([, manifest, reached], { expect, onTestFinished }) => {
		expect.assertions(2);

		const surface = surfaceOf(writePackage(shipped, onTestFinished), manifest);

		expect(surface).toContain(reached);
		expect(surface).not.toContain("dist/internal.d.ts");
	});

	it.for<[string, Record<string, unknown>]>([
		["without an exports map", { types: "./dist/index.d.ts" }],
		["with a wildcard subpath", { exports: { "./*": "./dist/*.js" } }],
		["with a folder subpath", { exports: { "./": "./dist/" } }],
		["with typesVersions", { exports: "./dist/index.js", typesVersions: {} }],
		["when no entry point resolves", { exports: "./dist/missing.js" }],
	])("walks every declaration %s", ([, manifest], { expect, onTestFinished }) => {
		expect.assertions(1);

		const directory = writePackage(shipped, onTestFinished);

		expect(surfaceOf(directory, manifest)).toContain("dist/internal.d.ts");
	});
});

describe("extendManifest", () => {
	const table = [{ name: "example", dependencies: { "@types/estree": "^1" }, fixedIn: "2.0.0" }];

	it("extends a version below the upstream fix", ({ expect }) => {
		expect.assertions(1);

		const manifest = extendManifest({ name: "example", version: "1.9.9" }, table);

		expect(manifest.dependencies).toStrictEqual({ "@types/estree": "^1" });
	});

	it.for(["2.0.0", "2.0.1", "10.0.0"])("leaves %s alone", (version, { expect }) => {
		expect.assertions(1);

		const manifest = extendManifest({ name: "example", version }, table);

		expect(manifest.dependencies).toBeUndefined();
	});

	it("treats a prerelease as its release version", ({ expect }) => {
		expect.assertions(1);

		const manifest = extendManifest({ name: "example", version: "2.0.0-beta.1" }, table);

		expect(manifest.dependencies).toBeUndefined();
	});
});
