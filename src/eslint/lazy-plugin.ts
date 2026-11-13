import { findPackageJSON } from "node:module";
import { pathToFileURL } from "node:url";

import { isRecord } from "../guards.ts";
import { require } from "../utils.ts";
import type { TypedFlatConfigItem } from "./types.ts";

type Plugin = NonNullable<TypedFlatConfigItem["plugins"]>[string];

interface PluginIdentity {
	name: string;
	version: string;
}

/**
 * Memoised per specifier: `eslint-flat-config-utils` compares plugin objects by
 * identity (`_verifyPluginsConflicts`), and `antfu` / `small-rules` are
 * registered from several config modules, so every registration of a specifier
 * has to hand back the same object.
 */
const proxies = new Map<string, object>();

const hydrated = new Set<string>();

/**
 * Register a plugin without loading it.
 *
 * **Register with `lazyPlugin`; reach for `interopDefault(import(...))` only
 * when the config module reads the plugin object at composition time**, as
 * `stylistic.ts` (`configs.customize`) and `typescript.ts` (`pluginTs.configs`,
 * spread into the rules) do. A module that registers such a prefix again must
 * reuse that eager object (`react.ts` with `ts`), because a prefix registered
 * twice has to be the same object. A package whose `exports` has only an
 * `import` condition (the `eslint-plugin-react-*` family) must also stay eager,
 * because `hydrate` loads with `require`. Everything else merely puts the
 * object in a `plugins` record, and reading it is ESLint's job. Parsers are the
 * standing exception and cannot use this at all: ESLint's
 * `languageOptionsSchema` merge calls `hasMethod` on `languageOptions.parser`,
 * which enumerates the object during config normalization and would hydrate a
 * proxy before any file is parsed.
 *
 * Config init is ~99% plugin imports, and most of that cost is module
 * resolution rather than execution. ESLint never touches a plugin object while
 * linting a file whose configs reference none of its rules, so the prefixes
 * that only carry rules for Markdown fences (`jsdoc`, `perfectionist`,
 * `small-rules`, ...) or for a non-JS language (`jsonc`, `toml`,
 * `package-json`, ...) stay unresolved for the whole of a TypeScript lint.
 * Every rule is still registered: the per-file decision is ESLint's, taken from
 * the resolved rule set, so coverage is unchanged and the cost simply moves to
 * the run that needs it.
 *
 * Plugin identity never hydrates. With `--cache`, ESLint hashes each file's
 * merged config, and `Config#toJSON()` reads every plugin's `name`, `version`
 * and `meta` (`getObjectId`) — on warm runs too, where no rule runs. So `meta`
 * answers `{ name, version }` from the package's `package.json`, and the
 * top-level `name` and `version` answer `undefined`. Once the plugin is
 * loaded, `meta` is the real one with the same `name` and `version` laid over
 * it, so the cache hash is the same before and after hydration. A package
 * whose nearest `package.json` has no `name` and `version` gets its real
 * `meta`, which loads it. The cost: `eslint --print-config` prints the package
 * name and version, which differ from the plugin's own `meta` for a few
 * plugins (`antfu`, `small-rules`).
 *
 * @template T - The plugin's shape. Registration-only call sites can leave this
 *   as the untyped default; where the module reads the object, `import type`
 *   the package's default export and pass `typeof PluginFoo`, so the reads
 *   stay type-checked.
 * @param specifier - The plugin package to load on first access.
 * @param transform - Applied once to the loaded plugin, for plugins that need
 *   adapting before use. Memoisation is keyed on `specifier` alone, so a second
 *   call for the same specifier returns the first proxy and ignores this.
 * @returns A plugin object that loads `specifier` when first read.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- `T` is the caller's claim about a package this module loads untyped; it exists to keep the reads at the call site checked
export function lazyPlugin<T = Plugin>(
	specifier: string,
	transform?: (plugin: object) => object,
): T {
	const existing = proxies.get(specifier);
	if (existing !== undefined) {
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the proxy forwards to the real plugin; `T` is the caller's claim about it
		return existing as T;
	}

	let plugin: object | undefined;
	/** `false` once the `package.json` turned out to have no identity. */
	let identity: false | PluginIdentity | undefined;
	let loadedMeta: unknown;

	function load(): object {
		plugin ??= hydrate(specifier, transform);
		return plugin;
	}

	function identityMeta(): unknown {
		identity ??= readIdentity(specifier) ?? false;
		if (identity === false) {
			return Reflect.get(load(), "meta");
		}

		if (plugin === undefined) {
			return identity;
		}

		if (loadedMeta === undefined) {
			const real: unknown = Reflect.get(plugin, "meta");
			loadedMeta = { ...(isRecord(real) ? real : {}), ...identity };
		}

		return loadedMeta;
	}

	const proxy = new Proxy(
		{},
		{
			defineProperty: (_target, property, descriptor) => {
				return Reflect.defineProperty(load(), property, descriptor);
			},
			deleteProperty: (_target, property) => Reflect.deleteProperty(load(), property),
			get: (_target, property): unknown => {
				// A plugin is never a thenable, and answering `then` without
				// loading keeps an `await` or a `Promise.all` slot from
				// hydrating it. The identity reads come from ESLint's cache
				// hash (see the doc comment); `meta` must win over the
				// old-style top-level fields, so those stay `undefined` after
				// hydration too.
				if (property === "then" || property === "name" || property === "version") {
					return;
				}

				if (property === "meta") {
					return identityMeta();
				}

				return Reflect.get(load(), property);
			},
			getOwnPropertyDescriptor: (_target, property) => {
				const descriptor = Reflect.getOwnPropertyDescriptor(load(), property);
				if (descriptor === undefined) {
					return;
				}

				// A proxy may not report a property as non-configurable when the
				// target (an empty object) has no such own property.
				return { ...descriptor, configurable: true };
			},
			has: (_target, property) => Reflect.has(load(), property),
			ownKeys: () => Reflect.ownKeys(load()),
			set: (_target, property, value) => Reflect.set(load(), property, value),
		},
	);

	proxies.set(specifier, proxy);
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the proxy forwards to the real plugin; `T` is the caller's claim about it
	return proxy as T;
}

/**
 * The specifiers whose plugins have been loaded, for the laziness regression
 * test.
 *
 * @returns The hydrated specifiers.
 */
export function hydratedLazyPlugins(): ReadonlySet<string> {
	return hydrated;
}

/**
 * The specifiers registered lazily, for the laziness regression test.
 *
 * Without this the test can only catch "a lazy plugin loaded too early", not
 * "a plugin stopped being lazy" — the likelier regression, since a contributor
 * adding a config module will copy whichever neighbor they land on.
 *
 * @returns The registered specifiers.
 */
export function registeredLazyPlugins(): ReadonlySet<string> {
	return new Set(proxies.keys());
}

/**
 * Read a plugin's identity from the `package.json` nearest to the entry that
 * `hydrate` would load. This resolves the specifier but does not load it.
 *
 * @param specifier - The plugin package.
 * @returns The package name and version, or `undefined` when the nearest
 *   `package.json` does not have both.
 */
function readIdentity(specifier: string): PluginIdentity | undefined {
	const manifestPath = findPackageJSON(pathToFileURL(require.resolve(specifier)));
	const manifest: unknown = manifestPath === undefined ? undefined : require(manifestPath);
	if (
		!isRecord(manifest) ||
		typeof manifest["name"] !== "string" ||
		typeof manifest["version"] !== "string"
	) {
		return undefined;
	}

	return { name: manifest["name"], version: manifest["version"] };
}

/**
 * Load a plugin synchronously. `engines.node` is `>=24.15.0`, where
 * `require(esm)` is stable, so the ESM-only plugins need no async fallback.
 *
 * @param specifier - The plugin package to load.
 * @param transform - Applied to the loaded plugin.
 * @returns The plugin.
 * @throws When the module does not export a plugin object.
 */
function hydrate(specifier: string, transform?: (plugin: object) => object): object {
	hydrated.add(specifier);

	const resolved: unknown = require(specifier);
	const exported = isRecord(resolved) && "default" in resolved ? resolved["default"] : resolved;
	if (!isRecord(exported)) {
		throw new TypeError(`Plugin "${specifier}" did not resolve to an object`);
	}

	return transform === undefined ? exported : transform(exported);
}
