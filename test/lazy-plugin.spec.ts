import type PluginMarkdown from "@eslint/markdown";

import { ESLint } from "eslint";
import type PluginDeMorgan from "eslint-plugin-de-morgan";
import path from "node:path";
import { describe, it } from "vitest";

import { MARKDOWN_PROCESSOR_NAME } from "../src/eslint/configs/markdown.ts";
import {
	hydratedLazyPlugins,
	lazyPlugin,
	registeredLazyPlugins,
} from "../src/eslint/lazy-plugin.ts";
import { isentinel } from "../src/index.ts";
import { fatalMessages } from "./helpers.ts";

/** The identity fields ESLint's `getObjectId` reads off a plugin. */
interface IdentityProbe {
	name?: unknown;
	meta: Record<string, unknown>;
	rules?: unknown;
	version?: unknown;
}

interface LazySetup {
	/** The specifiers hydrated by composition alone. */
	composed: Array<string>;
	eslint: ESLint;
	/** The specifiers registered lazily. */
	registered: ReadonlySet<string>;
}

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Plugins whose rules a TypeScript file never reaches: they are alive only
 * inside Markdown fences, or only for a non-JS language, or (`unused-imports`)
 * oxlint runs all their rules in this `oxlint: true` composition. Loading one
 * while linting `.ts` means a config module regressed — a rule moved onto a
 * source glob, or a plugin object got read at composition time.
 */
const DEFERRED_SPECIFIERS = [
	"@cspell/eslint-plugin",
	"@eslint/markdown",
	"@pobammer-ts/small-rules",
	"eslint-plugin-better-max-params",
	"eslint-plugin-comment-length",
	"eslint-plugin-de-morgan",
	"eslint-plugin-import-lite",
	"eslint-plugin-jsonc",
	"eslint-plugin-oxfmt",
	"eslint-plugin-package-json",
	"eslint-plugin-perfectionist",
	"eslint-plugin-toml",
	"eslint-plugin-unused-imports",
];

/**
 * The three deferred plugins a `.ts` file does reach. ESLint's
 * `#normalizeRulesConfig` reads `meta.defaultOptions` off every rule listed in
 * a file's resolved config, including the ones the preset lists as `"off"`, so
 * a prefix survives on `.ts` as long as one `"off"` entry of it does.
 */
const OFF_ENTRY_SPECIFIERS = [
	"eslint-plugin-antfu",
	"eslint-plugin-jsdoc",
	"eslint-plugin-promise",
];

/**
 * The plugins a config module reads while composing, so registering them
 * lazily cannot defer them. `stylistic()` reads `configs.customize`; it is
 * lazy only so that `comments()` and `react()`, which merely register the
 * `style` prefix, cost nothing on a `stylistic: false` run.
 */
const COMPOSITION_TIME_READS = ["@stylistic/eslint-plugin"];

/**
 * Plugins a `.ts` file always reaches, registered lazily so that a process
 * linting only JSON, YAML or Markdown does not load them.
 */
const SOURCE_SPECIFIERS = [
	"eslint-plugin-flawless",
	"eslint-plugin-sonarjs",
	"eslint-plugin-unicorn",
];

/** Every plugin the composed config must register lazily. */
const LAZY_SPECIFIERS = [...DEFERRED_SPECIFIERS, ...OFF_ENTRY_SPECIFIERS, ...SOURCE_SPECIFIERS];

/**
 * Local plugin packages, so the identity tests own their hydration state. Each
 * entry is an absolute path that no config module registers.
 */
const FIXTURE_ROOT = path.resolve(PROJECT_ROOT, "fixtures", "lazy-plugin");
const WITH_IDENTITY = path.join(FIXTURE_ROOT, "with-identity", "index.cjs");
const WITHOUT_IDENTITY = path.join(FIXTURE_ROOT, "without-identity", "lib", "index.cjs");

let pending: Promise<LazySetup> | undefined;

/**
 * Compose the config under test and capture the lazy-plugin state around it.
 *
 * @returns The composed config and the lazy-plugin state.
 */
async function compose(): Promise<LazySetup> {
	const composer = await isentinel({
		name: "test/lazy-plugin",
		gitignore: false,
		isAgent: false,
		isInEditor: false,
		oxlint: true,
		pnpm: false,
	});

	const configs = [...composer];
	const composed = [...hydratedLazyPlugins()];
	const registered = registeredLazyPlugins();
	const eslint = new ESLint({
		cwd: PROJECT_ROOT,
		overrideConfig: configs,
		overrideConfigFile: true,
	});

	return { composed, eslint, registered };
}

/**
 * The composition, built once. Memoised rather than a setup hook: hydration is
 * process-wide and one-way, so every test here shares one composition.
 *
 * @returns The composed config and the lazy-plugin state.
 */
async function setup(): Promise<LazySetup> {
	pending ??= compose();
	return pending;
}

describe("lazy plugins", () => {
	it("should load only the composition-time reads while composing the config", async ({
		expect,
	}) => {
		expect.assertions(1);

		const { composed } = await setup();

		expect(composed).toStrictEqual(COMPOSITION_TIME_READS);
	});

	it("should register every deferred plugin lazily", async ({ expect }) => {
		expect.assertions(1);

		// Catches the reverse regression: a module reverting to
		// `interopDefault(import(...))` never enters the hydration set, so the
		// assertions below would pass while the plugin loaded eagerly.
		const { registered } = await setup();
		const eager = LAZY_SPECIFIERS.filter((specifier) => !registered.has(specifier));

		expect(eager).toStrictEqual([]);
	});

	// Ordered: hydration is one-way and process-wide, so this has to run before
	// anything lints Markdown.
	it("should load only the off-entry and source plugins while linting a TypeScript file", async ({
		expect,
	}) => {
		expect.assertions(2);

		// A real project file, so the type-aware pass has a program for it.
		const { eslint } = await setup();
		const file = path.resolve(PROJECT_ROOT, "src", "globs.ts");
		const results = await eslint.lintFiles([file]);

		expect(fatalMessages(results)).toStrictEqual([]);

		// `--cache` hashes the serialized config, which reads every plugin's
		// identity. That must not hydrate the plugins the file never reaches.
		JSON.stringify(await eslint.calculateConfigForFile(file));

		const loaded = hydratedLazyPlugins();
		const reached = LAZY_SPECIFIERS.filter((specifier) => loaded.has(specifier));

		expect(reached).toStrictEqual([...OFF_ENTRY_SPECIFIERS, ...SOURCE_SPECIFIERS]);
	});

	it("should load the fence plugins when a Markdown file is linted", async ({ expect }) => {
		expect.assertions(2);

		const { eslint } = await setup();
		const results = await eslint.lintFiles([
			path.resolve(PROJECT_ROOT, "fixtures", "input", "markdown.md"),
		]);
		const ruleIds = new Set(
			results.flatMap((result) => result.messages.map((message) => message.ruleId)),
		);

		// The fence rules still fire, which is the whole point: deferring the
		// implementations moved the cost, not the coverage.
		expect([...ruleIds]).toContain("perfectionist/sort-objects");

		const loaded = hydratedLazyPlugins();
		const expected = ["@eslint/markdown", "eslint-plugin-perfectionist"];

		expect(expected.filter((specifier) => !loaded.has(specifier))).toStrictEqual([]);
	});
});

describe("lazyPlugin", () => {
	it("should return the same object for a specifier", ({ expect }) => {
		expect.assertions(1);

		expect(lazyPlugin("eslint-plugin-de-morgan")).toBe(lazyPlugin("eslint-plugin-de-morgan"));
	});

	it("should write through to the real plugin, for disableRulesFix", ({ expect }) => {
		expect.assertions(1);

		// `hijackPluginRule` does `plugin.rules[name] = patched`, so the `get`
		// has to hand back the real `rules` object rather than a copy.
		const plugin = lazyPlugin<typeof PluginDeMorgan>("eslint-plugin-de-morgan");
		const original = plugin.rules["no-negated-conjunction"];
		const patched = { ...original };
		plugin.rules["no-negated-conjunction"] = patched;
		const afterPatch = plugin.rules["no-negated-conjunction"];
		plugin.rules["no-negated-conjunction"] = original;

		expect(afterPatch).toBe(patched);
	});

	it("should name the markdown stand-in processor after the real one", ({ expect }) => {
		expect.assertions(1);

		// The stand-in restates this name so `mergeProcessors` can build its id
		// without loading the plugin; a rename upstream would silently shift
		// every consumer's ESLint cache key.
		const plugin = lazyPlugin<typeof PluginMarkdown>("@eslint/markdown");

		expect(plugin.processors.markdown.meta.name).toBe(MARKDOWN_PROCESSOR_NAME);
	});

	// Ordered: hydration is one-way and process-wide, so the first test has to
	// read the fixture's identity before the second one loads it.
	it("should answer the plugin identity without loading it", ({ expect }) => {
		expect.assertions(4);

		const plugin = lazyPlugin<IdentityProbe>(WITH_IDENTITY);

		expect(plugin.name).toBeUndefined();
		expect(plugin.version).toBeUndefined();
		expect(plugin.meta).toStrictEqual({
			name: "fixture-plugin-with-identity",
			version: "1.2.3",
		});
		expect(hydratedLazyPlugins().has(WITH_IDENTITY)).toBe(false);
	});

	it("should lay the identity over the real meta once loaded", ({ expect }) => {
		expect.assertions(3);

		// ESLint's cache hash reads this identity; if it moved on hydration,
		// a file would miss the cache whenever its plugin happened to load.
		const plugin = lazyPlugin<IdentityProbe>(WITH_IDENTITY);

		expect(plugin.rules).toStrictEqual({});
		expect(plugin.name).toBeUndefined();
		expect(plugin.meta).toStrictEqual({
			name: "fixture-plugin-with-identity",
			namespace: "fixture",
			version: "1.2.3",
		});
	});

	it("should fall back to the real meta when the package has no identity", ({ expect }) => {
		expect.assertions(2);

		// The entry's nearest `package.json` is a nested `{ "type": ... }` one.
		const plugin = lazyPlugin<IdentityProbe>(WITHOUT_IDENTITY);

		expect(plugin.meta).toStrictEqual({ name: "own-name", version: "0.0.0" });
		expect(hydratedLazyPlugins().has(WITHOUT_IDENTITY)).toBe(true);
	});
});
