/**
 * Package extensions for dependencies whose published type declarations import
 * packages they never declare.
 *
 * Under `enableGlobalVirtualStore: true` a package's real location leaves the
 * project tree entirely, so the parent-directory walk TypeScript performs no
 * longer passes through pnpm's hidden hoist store or the project root. A
 * dependency then sees only its own declared dependencies, and every
 * under-declared type import silently degrades to `any` (`skipLibCheck` hides
 * the `TS2307` but the error type remains).
 *
 * This table is the sole source of truth, read by three consumers:
 *
 * - This package's `pnpmfile.mjs`, which pnpm auto-loads for anyone who
 *   installs it as a config dependency. It applies {@link publishedExtensions}
 *   rather than the whole table — see `consumerFacing` below. Consumers need
 *   the hook at all because `packageExtensions` is project-local and cannot be
 *   published.
 * - `scripts/gen-package-extensions.ts`, which renders the table into the
 *   `packageExtensions` block of this repository's own `pnpm-workspace.yaml`.
 *   Our install therefore needs no pnpmfile: pnpm applies the same repairs
 *   natively.
 * - `scripts/check-package-extensions.ts`, which fails when an installed
 *   package gains an under-declared import that no entry covers.
 *
 * Plain JavaScript rather than TypeScript because pnpm's config-dependency
 * loader only probes `pnpmfile.mjs`/`.cjs`, and Node refuses to strip types
 * from files under `node_modules`. JSDoc carries the types instead.
 */
/**
 * @typedef {object} PackageExtension
 * @property {boolean} [consumerFacing] Whether a consumer of
 *   `@isentinel/eslint-config` loads this package's declarations. Only the
 *   preset's published type surface counts: every other entry repairs a package
 *   that ESLint loads at runtime, where resolution is not broken, so injecting
 *   it downstream would add `@types` packages nobody's program reads.
 *   `scripts/check-published-extensions.ts` derives the true set from the built
 *   declarations and fails when a flag disagrees.
 * @property {Record<string, string>} [dependencies] Declarations to add to
 *   `dependencies`.
 * @property {string} [fixedIn] The first version to declare these itself. Later
 *   versions are left alone.
 * @property {Array<string>} [ignore] Specifiers accounted for without being
 *   injected, because they are not part of the package's type surface. Read
 *   only by the check script; nothing is injected for them.
 * @property {string} name The package to extend.
 * @property {Record<string, string>} [peerDependencies] Declarations to add to
 *   `peerDependencies`, each marked optional.
 */
/**
 * The parts of a package manifest this table reads and writes. Every dependency
 * field arrives as an object, since pnpm fills them in before calling the hook,
 * but a manifest built by hand — in tests, say — need not carry them.
 *
 * @typedef {object} PackageManifest
 * @property {Record<string, string>} [dependencies] What the package declares.
 * @property {string} [name] The package's name, matched against an entry.
 * @property {Record<string, string>} [peerDependencies] What the package
 *   expects its consumer to provide.
 * @property {Record<string, { optional?: boolean }>} [peerDependenciesMeta]
 *   Which of those peers are optional.
 * @property {string} [version] The installed version, tested against `fixedIn`.
 */
/**
 * A tsconfig template variable that leaked into two plugins' published
 * declarations. Unresolvable under any layout; tracked in
 * christopher-buss/eslint-config#640.
 */
// oxlint-disable-next-line no-template-curly-in-string -- The literal text those declarations ship.
const LEAKED_CONFIG_DIR = "${configDir}";
/** The release portion of a version, up to any prerelease or build metadata. */
const RELEASE_SEPARATOR = /[-+]/u;
/** @type {ReadonlyArray<PackageExtension>} */
export const packageExtensions = [
	{
		name: "@cspell/eslint-plugin",
		dependencies: {
			"@types/estree": "^1",
		},
	},
	{
		name: "@e18e/eslint-plugin",
		dependencies: {
			"@eslint/core": "^1",
			"@types/estree": "^1",
		},
		peerDependencies: {
			"@typescript-eslint/typescript-estree": "*",
			"@typescript-eslint/utils": "*",
			"typescript": "*",
		},
	},
	{
		name: "@es-joy/jsdoccomment",
		peerDependencies: {
			eslint: "*",
		},
	},
	{
		name: "@eslint-community/eslint-utils",
		dependencies: {
			"@types/estree": "^1",
		},
	},
	{
		name: "@eslint/markdown",
		dependencies: {
			"@types/mdast": "^4",
			"@types/unist": "^3",
		},
	},
	{
		name: "@stylistic/eslint-plugin",
		// `define-config-support.d.ts` augments a package that is deprecated
		// and only present for consumers who opted into it themselves.
		ignore: ["eslint-define-config"],
	},
	{
		name: "@typescript-eslint/types",
		consumerFacing: true,
		peerDependencies: {
			typescript: "*",
		},
	},
	{
		name: "editorconfig",
		// Test declarations ship inside the tarball.
		ignore: ["chai"],
	},
	{
		name: "eslint-flat-config-utils",
		consumerFacing: true,
		peerDependencies: {
			eslint: "*",
		},
	},
	{
		name: "eslint-plugin-comment-length",
		// Rule-tester declarations ship inside the tarball.
		ignore: ["@typescript-eslint/rule-tester"],
	},
	{
		name: "eslint-plugin-de-morgan",
		dependencies: {
			"@types/estree": "^1",
		},
	},
	{
		name: "eslint-plugin-flawless",
		ignore: [LEAKED_CONFIG_DIR],
	},
	{
		name: "eslint-plugin-format-lua",
		ignore: ["eslint-define-config"],
	},
	{
		name: "eslint-plugin-jsdoc",
		dependencies: {
			"@eslint/core": "^1",
			"@types/estree": "^1",
			"@types/json-schema": "^7",
			"jsdoc-type-pratt-parser": "^7",
		},
		peerDependencies: {
			"@typescript-eslint/types": "*",
		},
	},
	{
		name: "eslint-plugin-jsonc",
		dependencies: {
			"@types/estree": "^1",
		},
	},
	{
		name: "eslint-plugin-n",
		dependencies: {
			"@eslint/core": "^1",
			"@types/estree": "^1",
		},
	},
	{
		name: "eslint-plugin-perfectionist",
		peerDependencies: {
			"@typescript-eslint/types": "*",
			"typescript": "*",
		},
	},
	{
		name: "eslint-plugin-roblox-ts",
		ignore: [LEAKED_CONFIG_DIR],
	},
	{
		name: "eslint-plugin-sentinel",
		peerDependencies: {
			"@typescript-eslint/utils": "*",
		},
	},
	{
		name: "eslint-plugin-sonarjs",
		dependencies: {
			"@eslint/core": "^1",
			"@types/estree": "^1",
			"@types/estree-jsx": "^1",
			"@types/functional-red-black-tree": "^1",
			"@types/semver": "^7",
			"type-fest": "^5",
		},
		peerDependencies: {
			"@typescript-eslint/utils": "*",
		},
	},
	{
		name: "fdir",
		dependencies: {
			"@types/picomatch": "^4",
		},
	},
	{
		name: "generate-differences",
		dependencies: {
			"diff-match-patch-es": "^1",
		},
	},
	{
		name: "jsdoc-type-pratt-parser",
		dependencies: {
			"@types/estree": "^1",
		},
		// Test and build declarations ship inside the tarball but are not
		// reachable from the package's entry points.
		ignore: ["mocha", "tsup"],
	},
	{
		name: "jsonc-eslint-parser",
		dependencies: {
			"@types/estree": "^1",
		},
		peerDependencies: {
			eslint: "*",
		},
	},
	{
		name: "mdast-util-gfm-autolink-literal",
		dependencies: {
			"mdast-util-from-markdown": "^2",
			"mdast-util-to-markdown": "^2",
		},
	},
	{
		name: "pkg-types",
		peerDependencies: {
			typescript: "*",
		},
	},
	{
		name: "toml-eslint-parser",
		peerDependencies: {
			eslint: "*",
		},
	},
	{
		name: "yaml-eslint-parser",
		peerDependencies: {
			eslint: "*",
		},
	},
];

/**
 * The entries a consumer's program actually loads, which is all the shipped
 * hook applies. The rest repair packages ESLint only ever loads at runtime, so
 * injecting them downstream would install `@types` packages no consumer's
 * program reads.
 *
 * @type {ReadonlyArray<PackageExtension>}
 */
export const publishedExtensions = packageExtensions.filter(
	(extension) => extension.consumerFacing === true,
);

/**
 * Injects the declarations `extensions` lists for this manifest. Existing
 * declarations always win, so an upstream fix takes effect without the table
 * having to be updated first.
 *
 * @param {PackageManifest} manifest - The manifest pnpm read from the package.
 * @param {ReadonlyArray<PackageExtension>} extensions - The table to apply.
 * @returns {PackageManifest} The same manifest, extended in place.
 */
export function extendManifest(manifest, extensions) {
	for (const extension of extensions) {
		if (extension.name !== manifest.name || isFixedUpstream(manifest, extension)) {
			continue;
		}

		if (extension.dependencies !== undefined) {
			injectDependencies(manifest, extension.dependencies);
		}

		if (extension.peerDependencies !== undefined) {
			injectPeerDependencies(manifest, extension.peerDependencies);
		}
	}

	return manifest;
}
/**
 * The `readPackage` hook itself, applying {@link publishedExtensions}. Takes
 * only the manifest: pnpm passes a context object as its second argument, so
 * the table must not be a parameter here.
 *
 * @param {PackageManifest} manifest - The manifest pnpm read from the package.
 * @returns {PackageManifest} The same manifest, extended in place.
 */
export function applyExtensions(manifest) {
	return extendManifest(manifest, publishedExtensions);
}

/**
 * Collects the entries of `additions` that `manifest` does not already declare
 * in any of its dependency fields.
 *
 * @param {PackageManifest} manifest - The manifest being extended.
 * @param {Record<string, string>} additions - The entries to add.
 * @returns {Record<string, string>} The entries that are genuinely missing.
 */
function missingFrom(manifest, additions) {
	const missing = {};
	for (const [name, range] of Object.entries(additions)) {
		if (
			manifest.dependencies?.[name] === undefined &&
			manifest.peerDependencies?.[name] === undefined
		) {
			missing[name] = range;
		}
	}

	return missing;
}

/**
 * Adds `additions` to the manifest's `dependencies`.
 *
 * @param {PackageManifest} manifest - The manifest being extended.
 * @param {Record<string, string>} additions - The declarations to inject.
 */
function injectDependencies(manifest, additions) {
	const missing = missingFrom(manifest, additions);
	if (Object.keys(missing).length > 0) {
		manifest.dependencies = { ...manifest.dependencies, ...missing };
	}
}

/**
 * Adds `additions` to the manifest's `peerDependencies`, each marked optional
 * so an absent provider never fails the install.
 *
 * @param {PackageManifest} manifest - The manifest being extended.
 * @param {Record<string, string>} additions - The declarations to inject.
 */
function injectPeerDependencies(manifest, additions) {
	const missing = missingFrom(manifest, additions);
	const names = Object.keys(missing);
	if (names.length === 0) {
		return;
	}

	manifest.peerDependencies = { ...manifest.peerDependencies, ...missing };
	const meta = { ...manifest.peerDependenciesMeta };
	for (const name of names) {
		meta[name] = { optional: true };
	}

	manifest.peerDependenciesMeta = meta;
}

/**
 * Splits a version into its numeric release components.
 *
 * @param {string} version - The version to split.
 * @returns {Array<number>} Its major, minor and patch numbers.
 */
function releaseParts(version) {
	const [release = version] = version.split(RELEASE_SEPARATOR, 1);
	return release.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

/**
 * Compares the release portion of two versions, ignoring any prerelease or
 * build metadata.
 *
 * @param {string} version - The version to test.
 * @param {string} other - The version to test it against.
 * @returns {boolean} Whether `version` sorts before `other`.
 */
function isBefore(version, other) {
	const left = releaseParts(version);
	const right = releaseParts(other);
	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0);
		if (difference !== 0) {
			return difference < 0;
		}
	}

	return false;
}

/**
 * Whether the installed version already declares what the entry would inject.
 *
 * @param {PackageManifest} manifest - The manifest pnpm read from the package.
 * @param {PackageExtension} extension - The entry matching it.
 * @returns {boolean} Whether to leave the manifest alone.
 */
function isFixedUpstream(manifest, extension) {
	if (extension.fixedIn === undefined || manifest.version === undefined) {
		return false;
	}

	return !isBefore(manifest.version, extension.fixedIn);
}
