import { describe, expect, it } from "vitest";

import {
	applyExtensions,
	extendManifest,
	packageExtensions,
	publishedExtensions,
} from "../pnpm-plugin/extensions.mjs";
import {
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
	it("has one entry per package, sorted by name", () => {
		expect.assertions(2);

		const names = packageExtensions.map((extension) => extension.name);
		const unique = new Set(names);

		expect(unique.size).toBe(names.length);
		expect(names).toStrictEqual(names.toSorted());
	});

	it.for(EXTENSION_INJECTIONS)("gives $name something to inject", ({ injected }) => {
		expect.assertions(1);

		expect(injected.length).toBeGreaterThan(0);
	});

	// An injected declaration that does not resolve leaves the import it
	// repairs unresolved, and the type an error type all the same.
	it.for(providers)(
		"resolves $provider from $dependent",
		({ dependent, directory, provider }) => {
			expect.assertions(1);

			expect(resolveDependency(directory, dependent, provider)).toBeDefined();
		},
	);
});

describe("applyExtensions", () => {
	it("injects declarations as optional peers", () => {
		expect.assertions(2);

		const manifest = applyExtensions({
			name: "eslint-flat-config-utils",
			version: "3.2.0",
		});

		expect(manifest.peerDependencies).toStrictEqual({ eslint: "*" });
		expect(manifest.peerDependenciesMeta).toStrictEqual({ eslint: { optional: true } });
	});

	it("leaves an existing declaration untouched", () => {
		expect.assertions(2);

		const manifest = applyExtensions({
			name: "eslint-flat-config-utils",
			dependencies: { eslint: "^10.0.0" },
			version: "3.2.0",
		});

		expect(manifest.dependencies).toStrictEqual({ eslint: "^10.0.0" });
		expect(manifest.peerDependencies).toBeUndefined();
	});

	it("returns unlisted manifests unchanged", () => {
		expect.assertions(1);

		expect(applyExtensions({ name: "not-in-the-table", version: "1.0.0" })).toStrictEqual({
			name: "not-in-the-table",
			version: "1.0.0",
		});
	});

	// The shipped hook carries the whole table but applies only the entries a
	// consumer's program loads. Everything else repairs a package ESLint loads
	// at runtime, where resolution was never broken.
	it("leaves an entry no consumer loads alone", () => {
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
	it("is the flagged subset of the table", () => {
		expect.assertions(2);

		const flagged = packageExtensions.filter((extension) => extension.consumerFacing === true);

		expect(publishedExtensions).toStrictEqual(flagged);
		expect(publishedExtensions.length).toBeLessThan(packageExtensions.length);
	});

	it("injects something for every entry it carries", () => {
		expect.assertions(1);

		const providerCounts = publishedExtensions.map((extension) => {
			return Object.keys({ ...extension.dependencies, ...extension.peerDependencies }).length;
		});

		expect(providerCounts.every((count) => count > 0)).toBe(true);
	});
});

describe("extendManifest", () => {
	const table = [{ name: "example", dependencies: { "@types/estree": "^1" }, fixedIn: "2.0.0" }];

	it("extends a version below the upstream fix", () => {
		expect.assertions(1);

		const manifest = extendManifest({ name: "example", version: "1.9.9" }, table);

		expect(manifest.dependencies).toStrictEqual({ "@types/estree": "^1" });
	});

	it.for(["2.0.0", "2.0.1", "10.0.0"])("leaves %s alone", (version) => {
		expect.assertions(1);

		const manifest = extendManifest({ name: "example", version }, table);

		expect(manifest.dependencies).toBeUndefined();
	});

	it("treats a prerelease as its release version", () => {
		expect.assertions(1);

		const manifest = extendManifest({ name: "example", version: "2.0.0-beta.1" }, table);

		expect(manifest.dependencies).toBeUndefined();
	});
});
