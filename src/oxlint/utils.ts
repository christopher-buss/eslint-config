import process from "node:process";
import { pathToFileURL } from "node:url";
import type { ExternalPluginEntry, OxlintOverride } from "oxlint";

import {
	collapsesToTsCoreRule,
	excludedFromOxlint,
	isOxlintCovered,
	isTsCoreCounterpartRule,
	oxlintJsPlugins,
	oxlintRuleMapping,
	translateRuleToOxlint,
} from "../rules/oxlint-mapping.ts";
import type { Rules } from "../types.ts";
import type { OxlintPlugin, TypedOxlintConfigItem } from "./types.ts";

const NATIVE_PLUGINS = new Set<string>([
	"eslint",
	"import",
	"jest",
	"jsdoc",
	"jsx-a11y",
	"nextjs",
	"node",
	"oxc",
	"promise",
	"react",
	"react-perf",
	"typescript",
	"unicorn",
	"vitest",
	"vue",
]);

/**
 * Whether a rule's plugin prefix names a plugin oxlint implements natively.
 *
 * @param prefix - The rule's plugin prefix.
 * @returns Whether the prefix is a native oxlint plugin.
 */
function isNativePlugin(prefix: string): prefix is OxlintPlugin {
	return NATIVE_PLUGINS.has(prefix);
}

/**
 * Anchor for resolving a plugin from the consumer project, used when a plugin
 * is a peer dependency the consumer installs rather than one we depend on.
 */
const consumerAnchor = pathToFileURL(`${process.cwd()}/`).href;

const specifierCache = new Map<string, string | undefined>();

export interface SplitOxlintRules {
	jsPluginRules: Rules;
	jsPlugins: Array<ExternalPluginEntry>;
	nativePlugins: Array<OxlintPlugin>;
	nativeRules: Rules;
}

export interface OxlintConfigFragmentOptions {
	name: string;
	excludeFiles?: Array<string>;
	files: Array<string>;
	globals?: NonNullable<TypedOxlintConfigItem["globals"]>;
	keepUnmappedOff?: boolean;
	rules: Rules | undefined;
	settings?: NonNullable<TypedOxlintConfigItem["settings"]>;
}

/**
 * Resolve a jsPlugin specifier, throwing when the package is not installed.
 *
 * @param specifier - The plugin package specifier.
 * @returns The absolute `file://` specifier.
 * @throws {Error} When the package cannot be resolved.
 */
export function resolveJsPluginSpecifier(specifier: string): string {
	const resolved = tryResolveJsPlugin(specifier);
	if (resolved === undefined) {
		throw new Error(
			`[@isentinel/eslint-config] Cannot resolve oxlint jsPlugin "${specifier}". ` +
				"Install it in your project, or disable the rules that require it.",
		);
	}

	return resolved;
}

/**
 * The dedupe key for a jsPlugin entry (a bare specifier, or a named entry).
 *
 * @param entry - A bare package specifier, or a `{ name, specifier }` entry.
 * @returns The plugin name used to deduplicate registrations.
 */
export function jsPluginKey(entry: ExternalPluginEntry): string {
	return typeof entry === "string" ? entry : entry.name;
}

/**
 * Anchor a slash-less override glob to the config directory.
 *
 * ESLint matches a flat-config `files` pattern without a `/` against
 * root-level entries only, while oxlint matches it gitignore-style at any
 * depth — a root-only relaxation such as `*` would silently apply to the
 * whole tree (#617). A leading `./` keeps oxlint's matching anchored without
 * changing what the pattern matches under ESLint semantics.
 *
 * @param glob - An override glob in ESLint `files` semantics.
 * @returns The glob, anchored when it has no path separator.
 */
export function anchorOxlintGlob(glob: string): string {
	return glob.includes("/") ? glob : `./${glob}`;
}

/**
 * Drop every rule whose plugin prefix is not registered on the generated
 * config, mutating the overrides in place. Oxlint fails the whole config build
 * on a rule naming an unknown plugin, so entries left behind by a plugin that
 * native-only mode dropped have to go rather than sit inert.
 *
 * Keyed on what is actually registered, so a consumer's own jsPlugin keeps its
 * rules while a preset plugin that is no longer loaded loses them. Unprefixed
 * (core) rules are always kept.
 *
 * @param overrides - The merged overrides (mutated).
 * @param registeredPlugins - Every native plugin and jsPlugin name registered.
 */
export function stripUnregisteredPluginRules(
	overrides: Array<OxlintOverride>,
	registeredPlugins: ReadonlySet<string>,
): void {
	for (const override of overrides) {
		const { rules } = override;
		if (rules === undefined) {
			continue;
		}

		for (const rule of Object.keys(rules)) {
			const slashIndex = rule.indexOf("/");
			if (slashIndex !== -1 && !registeredPlugins.has(rule.slice(0, slashIndex))) {
				delete rules[rule as keyof typeof rules];
			}
		}
	}
}

/**
 * Split a canonical (ESLint-named) rule map into oxlint-native rules and
 * jsPlugin rules, translating rule names via the oxlint rule mapping.
 *
 * Rules that are not part of the hybrid mapping (for example jest or react
 * rules, which only run in standalone mode) are treated as jsPlugin rules.
 * Disabled unmapped rules are skipped so that no jsPlugin is loaded solely for
 * an "off" entry, unless `keepUnmappedOff` is set (user options.rules must not
 * silently discard an explicit disable).
 *
 * @param rules - The canonical rule map.
 * @param keepUnmappedOff - Emit disabled unmapped rules instead of skipping
 *   them (without registering a jsPlugin for them).
 * @returns The split rules with the plugins each side requires.
 */
export function splitOxlintRules(
	rules: Rules | undefined,
	keepUnmappedOff = false,
): SplitOxlintRules {
	const nativeRules: Rules = {};
	const jsPluginRules: Rules = {};
	const nativePlugins = new Set<OxlintPlugin>();
	const jsPluginPrefixes = new Set<string>();
	const tsCollapsed = new Set<string>();

	const entries = Object.entries(rules ?? {});
	for (const [rule, value] of entries) {
		if (value === undefined || excludedFromOxlint.has(rule)) {
			continue;
		}

		const covered = isOxlintCovered(rule);
		const severity = Array.isArray(value) ? value[0] : value;
		const isOff = severity === "off" || severity === 0;
		const translated = translateRuleToOxlint(rule);

		const slashIndex = translated.indexOf("/");
		const prefix = slashIndex === -1 ? "eslint" : translated.slice(0, slashIndex);
		// Unmapped rules whose translated prefix is a native oxlint plugin (for
		// example oxc/*, which has no ESLint equivalent to map) run natively:
		// they need no jsPlugin specifier and must not be routed as jsPlugin
		// rules, which would throw on the missing specifier.
		const nativePrefix = isNativePlugin(prefix) ? prefix : undefined;

		if (!covered && isOff && keepUnmappedOff) {
			// Preserve an explicit disable. A native-prefix disable is kept and
			// registers its (always-available) native plugin, which lets a
			// config disable an unmapped native-only rule such as oxc/* for
			// specific files. A jsPlugin disable is kept only when the plugin is
			// installed, since oxlint errors the whole config build both on an
			// unregistered plugin and on a registered-but-unresolvable one.
			if (nativePrefix !== undefined) {
				nativeRules[translated] = value;
				nativePlugins.add(nativePrefix);
			} else {
				const specifier = oxlintJsPlugins[prefix];
				if (specifier !== undefined && canResolveJsPlugin(specifier)) {
					jsPluginRules[translated] = value;
					jsPluginPrefixes.add(prefix);
				}
			}

			continue;
		}

		if (!covered && isOff) {
			continue;
		}

		const uncoveredTarget = nativePrefix !== undefined ? "native" : "js-plugin";
		const target = covered ? mappedTarget(rule) : uncoveredTarget;

		if (target === "js-plugin") {
			jsPluginRules[translated] = value;
			jsPluginPrefixes.add(prefix);
			continue;
		}

		if (collapsesToTsCoreRule(rule)) {
			tsCollapsed.add(translated);
			nativeRules[translated] = value;
		} else if (!isTsCoreCounterpartRule(rule) || !tsCollapsed.has(translated)) {
			nativeRules[translated] = value;
		}

		if (nativePrefix !== undefined) {
			nativePlugins.add(nativePrefix);
		}
	}

	const jsPlugins: Array<ExternalPluginEntry> = [];
	for (const prefix of jsPluginPrefixes) {
		const specifier = oxlintJsPlugins[prefix];
		if (specifier === undefined) {
			throw new Error(`[@isentinel/eslint-config] Unknown oxlint jsPlugin prefix: ${prefix}`);
		}

		jsPlugins.push({ name: prefix, specifier: resolveJsPluginSpecifier(specifier) });
	}

	return {
		jsPluginRules,
		jsPlugins,
		nativePlugins: [...nativePlugins],
		nativeRules,
	};
}

/**
 * Create oxlint config fragments from a canonical rule map, one fragment for
 * native rules and one for jsPlugin rules.
 *
 * @param options - The fragment options.
 * @returns The generated config fragments.
 */
export function createOxlintConfigs({
	name,
	excludeFiles,
	files,
	globals,
	keepUnmappedOff = false,
	rules,
	settings,
}: OxlintConfigFragmentOptions): Array<TypedOxlintConfigItem> {
	const { jsPluginRules, jsPlugins, nativePlugins, nativeRules } = splitOxlintRules(
		rules,
		keepUnmappedOff,
	);

	const fragments: Array<TypedOxlintConfigItem> = [];

	if (Object.keys(nativeRules).length > 0) {
		fragments.push({
			name,
			...(excludeFiles ? { excludeFiles } : {}),
			files,
			...(globals ? { globals } : {}),
			plugins: nativePlugins,
			// The split rules are keyed by translated oxlint names, which the
			// eslint-side `Rules` typing cannot express.
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Rules and OxlintRules share a runtime shape; only the key naming differs.
			rules: nativeRules as TypedOxlintConfigItem["rules"],
			...(settings ? { settings } : {}),
		});
	}

	if (Object.keys(jsPluginRules).length > 0) {
		fragments.push({
			name: `${name}/js-plugin`,
			...(excludeFiles ? { excludeFiles } : {}),
			files,
			...(globals && fragments.length === 0 ? { globals } : {}),
			jsPlugins,
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Rules and OxlintRules share a runtime shape; only the key naming differs.
			rules: jsPluginRules as TypedOxlintConfigItem["rules"],
			...(settings && fragments.length === 0 ? { settings } : {}),
		});
	}

	return fragments;
}

/**
 * Resolve a specifier against an optional anchor, swallowing resolution errors.
 *
 * @param specifier - The plugin package specifier.
 * @param anchor - The URL to resolve against, or the current module by default.
 * @returns The resolved URL, or `undefined` when it does not resolve.
 */
function resolveFrom(specifier: string, anchor?: string): string | undefined {
	try {
		return import.meta.resolve(specifier, anchor);
	} catch {
		return undefined;
	}
}

/**
 * Resolve a jsPlugin package specifier to an absolute `file://` URL.
 *
 * Oxlint resolves bare `jsPlugins` specifiers relative to the consumer's config
 * file, which fails under pnpm's isolated node_modules: our plugin dependencies
 * only exist inside our own virtual store scope, never at the consumer's root.
 * Resolving here (from our package first, then the consumer) and emitting an
 * absolute specifier makes loading independent of the consumer's layout.
 *
 * @param specifier - The plugin package specifier.
 * @returns The resolved specifier, or `undefined` when it resolves nowhere.
 */
function tryResolveJsPlugin(specifier: string): string | undefined {
	const cached = specifierCache.get(specifier);
	if (cached !== undefined || specifierCache.has(specifier)) {
		return cached;
	}

	const resolved = resolveFrom(specifier) ?? resolveFrom(specifier, consumerAnchor);
	specifierCache.set(specifier, resolved);
	return resolved;
}

/**
 * Whether a jsPlugin package can be resolved from either our package or the
 * consumer project.
 *
 * @param specifier - The plugin package specifier.
 * @returns Whether the plugin is resolvable.
 */
function canResolveJsPlugin(specifier: string): boolean {
	return tryResolveJsPlugin(specifier) !== undefined;
}

function mappedTarget(rule: string): "js-plugin" | "native" {
	return oxlintRuleMapping[rule] === "js-plugin" ? "js-plugin" : "native";
}
