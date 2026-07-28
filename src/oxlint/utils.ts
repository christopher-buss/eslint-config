import process from "node:process";
import { pathToFileURL } from "node:url";
import type { ExternalPluginEntry, OxlintOverride } from "oxlint";

import { enabledPresetRuleNames } from "../generated/oxlint-capabilities.ts";
import { oxlintNativeRuleNames } from "../generated/oxlint-native.ts";
import type { Rules } from "../types.ts";
import { recordDroppedOverride, recordOverrideRules } from "./override-diagnostics.ts";
import {
	collapsesToTsCoreRule,
	isOxcCoveredRule,
	isTsCoreCounterpartRule,
	oxlintJsPlugins,
	resolveOxlintRule,
	translateRuleToOxlint,
} from "./routing.ts";
import type { OxlintPlugin, TypedOxlintConfigItem } from "./types.ts";

/**
 * Every plugin oxlint implements natively, derived from the generated rule
 * names so a new oxlint scope needs no edit here.
 */
const NATIVE_PLUGINS: ReadonlySet<string> = new Set(
	Array.from(oxlintNativeRuleNames, (rule) => rulePluginPrefix(rule)),
);

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
	/** The oxlint names of the rules that came from user overrides. */
	overrideRules: Array<string>;
}

export interface SplitOxlintRulesOptions {
	/**
	 * Emit disabled unmapped rules instead of skipping them (without
	 * registering a jsPlugin for them).
	 */
	keepUnmappedOff?: boolean;
	/**
	 * The rules a user supplied through an `overrides` option, by canonical
	 * ESLint name. They are authoritative: an override says "apply this rule at
	 * the scope this config option already covers", so it survives the filters
	 * that thin out preset rules, and is reported rather than dropped in
	 * silence when oxlint cannot run it at all.
	 *
	 * The filters cannot simply be lifted for everyone. The preset's own rule
	 * maps are full of disables for rules oxlint never had (the prettier
	 * disables in `oxfmt`, the `disables/*` configs), and emitting those would
	 * load a jsPlugin for nothing but an "off" entry, or register a native
	 * plugin on a scoped override — which hands that override's files every
	 * category-enabled rule the plugin owns. Honouring what the user wrote
	 * costs neither, because the user wrote a bounded set.
	 */
	overrides?: ReadonlySet<string>;
}

export interface OxlintConfigFragmentOptions {
	name: string;
	excludeFiles?: Array<string>;
	files: Array<string>;
	globals?: NonNullable<TypedOxlintConfigItem["globals"]>;
	keepUnmappedOff?: boolean;
	/**
	 * User-supplied rule overrides for this config module, merged over `rules`
	 * and treated as authoritative (see {@link SplitOxlintRulesOptions}, which
	 * explains why that treatment is theirs alone). Spreading them into `rules`
	 * instead would leave the splitter unable to tell them apart.
	 */
	overrides?: Rules;
	rules: Rules | undefined;
	settings?: NonNullable<TypedOxlintConfigItem["settings"]>;
}

const NO_OVERRIDES: ReadonlySet<string> = new Set();

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
 * A glob that narrows by file extension alone: `**\/*.<ext>`, with no directory
 * segment and no filename pattern before the extension. The source and
 * per-language globs qualify; `**\/*.spec.ts` and `**\/__tests__\/**` do not.
 */
const WHOLE_TREE_GLOB = /^\*\*\/\*\.[^./]+$/;

/**
 * Whether a fragment applies to every file of the kinds it targets.
 *
 * The distinction that matters is whether a fragment narrows by *file type* or
 * by *location*. A fragment covering `**\/*.ts` is the TypeScript rules'
 * natural domain, so its plugins belong at the top level where `categories`
 * reaches them project-wide; one covering `**\/*.spec.ts` is a location, and
 * its plugins have to stay on their own override.
 *
 * @param fragment - The fragment to classify.
 * @returns Whether the fragment narrows by extension only.
 */
export function isUnscopedFragment(fragment: TypedOxlintConfigItem): boolean {
	return (
		fragment.excludeFiles === undefined &&
		fragment.files.every((glob) => WHOLE_TREE_GLOB.test(glob))
	);
}

/**
 * Move file-scoped native plugins from the top level onto the overrides that
 * use them, mutating the overrides in place.
 *
 * A plugin registered at the top level hands every category-enabled rule it
 * owns to the whole project, however narrow the `files` glob that asked for it
 * was — the reason `vitest/*` fires on ordinary source files once a consumer
 * turns a category on. Registering it on the override instead confines it:
 * oxlint unions an override's `plugins` onto the base set, but applies
 * `categories` to the base set alone, so an override-registered plugin
 * contributes exactly the rules that override names and nothing more.
 *
 * A rule whose plugin is registered in neither place is silently ignored rather
 * than rejected, so every override naming a scoped plugin has to carry it —
 * including one that only disables its rules, which would otherwise lose a
 * relaxation it makes wherever the plugin *is* enabled. Carrying it costs
 * nothing, precisely because no category reaches it there.
 *
 * @param overrides - The merged overrides (mutated).
 * @param globalPlugins - Plugins registered at the top level.
 */
export function scopeOverridePlugins(
	overrides: Array<OxlintOverride>,
	globalPlugins: ReadonlySet<string>,
): void {
	for (const override of overrides) {
		const scoped = new Set<OxlintPlugin>();

		const declared = override.plugins ?? [];
		for (const plugin of declared) {
			if (!globalPlugins.has(plugin)) {
				scoped.add(plugin);
			}
		}

		const ruleNames = Object.keys(override.rules ?? {});
		for (const rule of ruleNames) {
			const prefix = rulePluginPrefix(rule);
			if (isNativePlugin(prefix) && !globalPlugins.has(prefix)) {
				scoped.add(prefix);
			}
		}

		if (scoped.size > 0) {
			override.plugins = [...scoped];
		} else {
			delete override.plugins;
		}
	}
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
 * @returns The oxlint names of the rules that were deleted.
 */
export function stripUnregisteredPluginRules(
	overrides: Array<OxlintOverride>,
	registeredPlugins: ReadonlySet<string>,
): Set<string> {
	const stripped = new Set<string>();

	for (const override of overrides) {
		const { rules } = override;
		if (rules === undefined) {
			continue;
		}

		for (const rule of Object.keys(rules)) {
			const slashIndex = rule.indexOf("/");
			if (slashIndex !== -1 && !registeredPlugins.has(rule.slice(0, slashIndex))) {
				delete rules[rule as keyof typeof rules];
				stripped.add(rule);
			}
		}
	}

	return stripped;
}

/**
 * Split a canonical (ESLint-named) rule map into Oxlint-native rules and
 * jsPlugin rules using the internal capability resolver.
 *
 * Off-only preset rules are skipped so generated capability discovery cannot
 * load a plugin solely for an `"off"` entry. Explicit user rules and overrides
 * remain authoritative.
 *
 * @param rules - The canonical rule map.
 * @param options - Which entries survive the filters, and which came from the
 *   user.
 * @returns The split rules with the plugins each side requires.
 */
export function splitOxlintRules(
	rules: Rules | undefined,
	{ keepUnmappedOff = false, overrides = NO_OVERRIDES }: SplitOxlintRulesOptions = {},
): SplitOxlintRules {
	const nativeRules: Rules = {};
	const jsPluginRules: Rules = {};
	const nativePlugins = new Set<OxlintPlugin>();
	const jsPluginPrefixes = new Set<string>();
	const tsCollapsed = new Set<string>();
	const overrideRules = new Set<string>();

	const entries = Object.entries(rules ?? {});
	for (const [rule, value] of entries) {
		if (value === undefined) {
			continue;
		}

		const isOverride = overrides.has(rule);
		const route = resolveOxlintRule(rule);
		// Alternate Oxc equivalents are emitted by the dedicated Oxc module.
		// A user override still targets that real native rule directly.
		if (!isOverride && isOxcCoveredRule(rule)) {
			continue;
		}

		if (route.kind === "eslint-only") {
			if (isOverride) {
				recordDroppedOverride({ reason: "eslint-only", rule });
			}

			continue;
		}

		// The eslint-only route already continued, so anything left is covered
		// unless it is unmanaged, and a covered route already carries the
		// translated name — asking `translateRuleToOxlint` would resolve the
		// same rule a second time to reach the answer we are holding.
		const covered = route.kind !== "unmanaged";
		const severity = Array.isArray(value) ? value[0] : value;
		const isOff = severity === "off" || severity === 0;
		const translated = covered ? route.oxlintName : translateRuleToOxlint(rule);

		// Capability detection must not load a jsPlugin just to carry an
		// off-only preset entry. Native rules need no plugin, so their disables
		// are free to emit — and they have to, because `categories` can only
		// ever switch native rules back on, and a rule the preset deliberately
		// disables must stay disabled when a consumer opts into a category.
		// User disables remain authoritative, and disables of rules enabled
		// elsewhere in the preset still preserve effective per-scope parity.
		if (
			isOff &&
			!isOverride &&
			!keepUnmappedOff &&
			route.kind === "js-plugin" &&
			!enabledPresetRuleNames.has(rule)
		) {
			continue;
		}

		const slashIndex = translated.indexOf("/");
		const prefix = slashIndex === -1 ? "eslint" : translated.slice(0, slashIndex);
		// Unmapped rules whose translated prefix is a native oxlint plugin (for
		// example oxc/*, which has no ESLint equivalent to map) run natively:
		// they need no jsPlugin specifier and must not be routed as jsPlugin
		// rules, which would throw on the missing specifier.
		const nativePrefix = isNativePlugin(prefix) ? prefix : undefined;

		if (isOverride) {
			overrideRules.add(translated);
		}

		if (!covered && isOff && (keepUnmappedOff || isOverride)) {
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
				} else if (isOverride) {
					recordDroppedOverride({ reason: "missing-plugin", rule });
				}
			}

			continue;
		}

		if (!covered && isOff) {
			continue;
		}

		// An unmanaged rule has no route to follow, so its own prefix decides:
		// a native oxlint plugin prefix means it runs natively, anything else
		// needs a jsPlugin.
		const unmanagedTarget = nativePrefix === undefined ? "js-plugin" : "native";
		const target = covered ? route.kind : unmanagedTarget;

		if (target === "js-plugin") {
			jsPluginRules[translated] = value;
			jsPluginPrefixes.add(prefix);

			if (route.kind === "js-plugin" && route.suppressedNativeName !== undefined) {
				nativeRules[route.suppressedNativeName] = "off";
				const suppressedPrefix = rulePluginPrefix(route.suppressedNativeName);
				if (isNativePlugin(suppressedPrefix)) {
					nativePlugins.add(suppressedPrefix);
				}
			}

			continue;
		}

		// `ts/<x>` and the bare core `<x>` collapse onto one native entry, and
		// the extension wins — unless the user wrote one of them in an override,
		// which outranks whichever half the preset supplied.
		const collapsedToOverride =
			!isOverride &&
			overrideRules.has(translated) &&
			(collapsesToTsCoreRule(rule) || isTsCoreCounterpartRule(rule));

		if (collapsedToOverride) {
			continue;
		}

		if (collapsesToTsCoreRule(rule)) {
			tsCollapsed.add(translated);
			nativeRules[translated] = value;
		} else if (isOverride || !isTsCoreCounterpartRule(rule) || !tsCollapsed.has(translated)) {
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
		overrideRules: [...overrideRules],
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
	overrides,
	rules,
	settings,
}: OxlintConfigFragmentOptions): Array<TypedOxlintConfigItem> {
	const merged = overrides === undefined ? rules : { ...rules, ...overrides };
	const { jsPluginRules, jsPlugins, nativePlugins, nativeRules, overrideRules } =
		splitOxlintRules(merged, {
			keepUnmappedOff,
			overrides: new Set(Object.keys(overrides ?? {})),
		});

	recordOverrideRules(overrideRules);

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
 * The plugin a rule name belongs to, with unprefixed core rules mapped to
 * `eslint`.
 *
 * @param rule - The oxlint rule name.
 * @returns The part before the slash, or `eslint` when there is none.
 */
function rulePluginPrefix(rule: string): string {
	const slashIndex = rule.indexOf("/");
	return slashIndex === -1 ? "eslint" : rule.slice(0, slashIndex);
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
