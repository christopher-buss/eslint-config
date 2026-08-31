import {
	effectivePresetRuleNames,
	jsPluginRuleNames,
	typeAwareJsPluginRuleNames,
} from "../generated/oxlint-capabilities.ts";
import {
	oxlintNativeRuleNames,
	typeAwareNativeOxlintRuleNames,
} from "../generated/oxlint-native.ts";
import {
	candidateNativeOxlintName,
	jsPluginAdapterFor,
	optionallyTypeAwareRules,
	oxlintFamilyPolicies,
	splitRuleName,
	TS_EXTENSION_TO_CORE,
	typeAwareJsPluginRules,
} from "./adapters.ts";

/** Where a rule runs when linting with Oxlint. */
export type OxlintTarget = "js-plugin" | "native" | "tsgolint";

/** The internal result of resolving a canonical ESLint rule. */
export type OxlintRoute =
	| { kind: "eslint-only"; reason: string }
	| {
			kind: "js-plugin";
			oxlintName: string;
			pluginAlias: string;
			specifier: string;
			suppressedNativeName?: string;
	  }
	| { kind: "native"; oxlintName: string; typeAware: boolean }
	| { kind: "unmanaged" };

/**
 * Notable rule families that intentionally stay in ESLint in hybrid mode, with
 * the reason why.
 *
 * The resolver itself is internal, so this is the only account a consumer gets
 * of why a rule they expected oxlint to run is still running in ESLint. Name
 * the rules, not just the category.
 */
/** Why a type-aware custom rule cannot move to an oxlint jsPlugin. */
const TYPE_AWARE_REASON = "Type-aware custom rule; oxlint jsPlugins have no type information";

export const staysInEslint = {
	"e18e/* (optionally type-aware)":
		"Four e18e rules (prefer-array-at, prefer-array-to-reversed, prefer-array-to-sorted, prefer-spread-syntax) run without type information but detect more with it, so they stay in ESLint (see optionallyTypeAwareRules); the rest run in oxlint as a jsPlugin",
	"eslint-comments/*":
		"Lints eslint-disable directives, which only exist in ESLint-linted code; oxlint-comments covers oxlint directives",
	"flawless/naming-convention":
		"Type-aware custom rule; oxlint jsPlugins have no type information. The syntax-only flawless rules (arrow-return-style, max-lines-per-function, no-conditional-empty-object-spread, no-conditional-in-test, no-export-default-arrow, no-floating-point-equality, no-known-value-widening, no-object-parameters, no-reflect-get, no-reflect-set, no-shape-in-symbol-names, no-unsafe-dictionary-type, padding-after-expect-assertions, prefer-ending-with-an-expect, prefer-expect-assertions-count, prefer-parameter-destructuring, the react jsx-shorthand-*, purity, no-unnecessary-use-*, prefer-destructuring-assignment) run in oxlint. flawless/no-redundant-tsconfig-options and every flawless/toml-* and flawless/yaml-* rule lint non-JS files and stay in ESLint",
	"flawless/no-redundant-type-annotation": TYPE_AWARE_REASON,
	"flawless/no-unknown-returns": TYPE_AWARE_REASON,
	"flawless/prefer-read-only-props": TYPE_AWARE_REASON,
	"format-lua/*": "Oxlint cannot lint Lua files",
	"jest/* (type-aware)":
		"Four type-aware jest rules stay in ESLint (see typeAwareJsPluginRules); the rest run in oxlint via eslint-plugin-jest as a jsPlugin (renamed jest-js, since oxlint reserves the native jest prefix), which honors settings.jest.globalPackage = @rbxts/jest-globals (the NATIVE oxlint jest plugin does not, https://github.com/oxc-project/oxc/issues/23290)",
	"jsonc/yaml/toml/markdown/package-json/pnpm/sort-*":
		"Oxlint only lints JS/TS files; JSON, YAML, TOML and Markdown stay in ESLint",
	"react/* (type-aware)":
		"The @eslint-react type-aware rules (no-implicit-children/key/ref, no-leaked-conditional-rendering, no-unused-props) need type information but do NOT declare requiresTypeChecking, so the metadata-based parity test cannot catch them; they are excluded manually and stay in ESLint",
	"roblox/* (type-aware)":
		"Type-aware custom rules (lua-truthiness etc.); oxlint jsPlugins have no type information",
	"sentinel/explicit-size-check": TYPE_AWARE_REASON,
	"type-aware jsPlugin rules":
		"Rules whose meta.docs.requiresTypeChecking is true crash or silently no-op under oxlint's jsPlugin runtime (no type information): sonar/no-ignored-return, sonar/no-incompatible-assertion-types, sonar/no-redundant-optional, sonar/no-try-promise, sonar/prefer-immediate-return, unicorn/no-non-function-verb-prefix, eslint-plugin/no-property-in-node, jest/no-error-equal, jest/no-unnecessary-assertion, jest/unbound-method, jest/valid-expect-with-promise, ts/prefer-destructuring (also has no native oxlint port)",
	"unicorn/no-unsafe-string-replacement":
		"False positives under oxlint's jsPlugin scope analysis (template-literal replacements are not resolved)",
	"unicorn/no-useless-coercion":
		"Optionally type-aware: values whose type is only known through TypeScript (a `string`-typed parameter, say) are missed without parser services, so it stays in ESLint (see optionallyTypeAwareRules)",
} satisfies Readonly<Record<string, string>>;

/** Rules covered by a differently named native Oxc implementation. */
export const oxcCoveredRules = new Map([
	["sonar/no-all-duplicated-branches", "oxc/branches-sharing-code"],
	["unicorn/no-accidental-bitwise-operator", "oxc/bad-bitwise-operator"],
]);

const TYPE_AWARE_METADATA_EXCEPTIONS: ReadonlySet<string> = new Set([
	...typeAwareJsPluginRules,
	"flawless/naming-convention",
	"flawless/prefer-read-only-props",
	"roblox/lua-truthiness",
	"roblox/misleading-lua-tuple-checks",
	"roblox/no-array-pairs",
	"roblox/no-object-math",
	"roblox/no-post-fix-new",
	"roblox/no-preceding-spread-element",
	"roblox/no-undeclared-scope",
	"roblox/size-method",
	"sentinel/explicit-size-check",
]);

/**
 * Whether a Flawless rule targets a file type Oxlint does not lint. Flawless
 * ships rules for several file types under one prefix; the TOML and YAML ones
 * announce themselves in the rule name, so they are matched by shape rather
 * than listed — a new `toml-*` rule would otherwise be routed to Oxlint, which
 * cannot lint the files it targets. The tsconfig rule has no such tell.
 *
 * @param name - The rule name without the `flawless/` prefix.
 * @returns Whether the rule must stay in ESLint.
 */
function isNonJsFlawlessName(name: string): boolean {
	return (
		name.startsWith("toml-") ||
		name.startsWith("yaml-") ||
		name === "no-redundant-tsconfig-options"
	);
}

const KNOWN_INCOMPATIBLE_RULES = new Map([
	["style/jsx-function-call-newline", "Formatting-rule ownership remains with ESLint and oxfmt."],
	[
		"unicorn/no-missing-local-resource",
		"The preset only enables this rule for Markdown virtual files, which Oxlint cannot lint.",
	],
	[
		"unicorn/no-unsafe-string-replacement",
		"Oxlint jsPlugin scope analysis cannot resolve template-literal replacements safely.",
	],
]);

/**
 * Rules that take the ESLint plugin even though Oxlint ports them natively.
 * `unicorn/no-lonely-if` is here because its JS implementation currently has
 * better autofix parity. A native preference needs no entry — that is what
 * every family gets by default.
 */
const JS_PLUGIN_PREFERRED_RULES: ReadonlySet<string> = new Set([
	"id-length",
	"no-loop-func",
	"unicorn/no-lonely-if",
]);

/**
 * Resolve one canonical ESLint rule against generated Oxlint capabilities and
 * the small amount of policy capability metadata cannot decide.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Its internal route.
 */
export function resolveOxlintRule(rule: string): OxlintRoute {
	const alternate = oxcCoveredRules.get(rule);
	if (alternate !== undefined) {
		return {
			kind: "native",
			oxlintName: alternate,
			typeAware: typeAwareNativeOxlintRuleNames.has(alternate),
		};
	}

	const reason = eslintOnlyReason(rule);
	if (reason !== undefined) {
		return { kind: "eslint-only", reason };
	}

	const native = nativeRoute(rule);
	const { prefix } = splitRuleName(rule);
	const prefersJsPlugin =
		JS_PLUGIN_PREFERRED_RULES.has(rule) || oxlintFamilyPolicies.get(prefix) === "js-plugin";

	if (prefersJsPlugin) {
		return jsPluginRoute(rule, native) ?? native ?? { kind: "unmanaged" };
	}

	return native ?? jsPluginRoute(rule, native) ?? { kind: "unmanaged" };
}

/**
 * The engine a resolved route runs in, or `undefined` when Oxlint does not run
 * the rule at all. The single place that decides a native route is a tsgolint
 * route, so the drop path, the audit script and the compatibility view cannot
 * drift on that question.
 *
 * @param route - A resolved route.
 * @returns Its target engine, if Oxlint runs it.
 */
export function routeTarget(route: OxlintRoute): OxlintTarget | undefined {
	if (route.kind === "js-plugin") {
		return "js-plugin";
	}

	if (route.kind === "native") {
		return route.typeAware ? "tsgolint" : "native";
	}

	return undefined;
}

/**
 * Build the compatibility view over the effective preset rule union.
 *
 * Resolving ~800 rules is only worth doing for a caller that needs the
 * preset-scoped view; the drop path asks the resolver per rule instead, and
 * with `oxlint: false` nothing needs this at all. `src/oxlint/index.ts` calls
 * this once for the public export, which the ESLint factory never loads.
 *
 * @returns The rule-to-target map.
 */
export function buildOxlintRuleMapping(): Readonly<Record<string, OxlintTarget>> {
	return Object.fromEntries(
		[...effectivePresetRuleNames].flatMap((rule): Array<[string, OxlintTarget]> => {
			if (oxcCoveredRules.has(rule)) {
				return [];
			}

			const target = routeTarget(resolveOxlintRule(rule));
			return target === undefined ? [] : [[rule, target]];
		}),
	);
}

function eslintOnlyReason(rule: string): string | undefined {
	if (optionallyTypeAwareRules.has(rule)) {
		return "The rule is optionally type-aware and would lose parser-service coverage.";
	}

	if (TYPE_AWARE_METADATA_EXCEPTIONS.has(rule)) {
		return "The rule needs type information that Oxlint jsPlugins cannot provide.";
	}

	const incompatible = KNOWN_INCOMPATIBLE_RULES.get(rule);
	if (incompatible !== undefined) {
		return incompatible;
	}

	const { name, prefix } = splitRuleName(rule);
	if (
		oxlintFamilyPolicies.get(prefix) === "eslint-only" ||
		(prefix === "flawless" && isNonJsFlawlessName(name))
	) {
		return "The rule targets a non-JavaScript file type that Oxlint does not lint.";
	}

	const hasNative = oxlintNativeRuleNames.has(candidateNativeOxlintName(rule));
	if (!hasNative && typeAwareJsPluginRuleNames.has(rule)) {
		return "The plugin declares that this rule requires type information.";
	}

	return undefined;
}

function nativeRoute(rule: string): Extract<OxlintRoute, { kind: "native" }> | undefined {
	const oxlintName = candidateNativeOxlintName(rule);
	if (!oxlintNativeRuleNames.has(oxlintName)) {
		return undefined;
	}

	return {
		kind: "native",
		oxlintName,
		typeAware: typeAwareNativeOxlintRuleNames.has(oxlintName),
	};
}

function jsPluginRoute(
	rule: string,
	native: Extract<OxlintRoute, { kind: "native" }> | undefined,
): Extract<OxlintRoute, { kind: "js-plugin" }> | undefined {
	if (!jsPluginRuleNames.has(rule) || typeAwareJsPluginRuleNames.has(rule)) {
		return undefined;
	}

	// The oxlint name, alias and specifier are all a pure function of the rule
	// name, so they are derived rather than stored per rule. A prefix added to
	// `oxlintJsPlugins` without a rename entry would land here as `undefined`;
	// `test/oxlint-routing.spec.ts` fails loudly on that.
	const adapter = jsPluginAdapterFor(rule);
	if (adapter === undefined) {
		return undefined;
	}

	return {
		kind: "js-plugin",
		...adapter,
		...(native === undefined ? {} : { suppressedNativeName: native.oxlintName }),
	};
}

let cachedMapping: Readonly<Record<string, OxlintTarget>> | undefined;

/**
 * Whether hybrid mode hands this effective preset rule to Oxlint.
 *
 * Preset-scoped: answers only for rules the preset itself names. Callers that
 * must agree with what the oxlint factory emits want {@link resolveOxlintRule},
 * which is total.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether Oxlint covers the rule.
 */
export function isPresetRuleOxlintCovered(rule: string): boolean {
	return rule in presetRuleMapping() || oxcCoveredRules.has(rule);
}

/**
 * Whether an alternate native Oxc rule covers this ESLint rule.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether a differently named native Oxc rule covers it.
 */
export function isOxcCoveredRule(rule: string): boolean {
	return oxcCoveredRules.has(rule);
}

/**
 * Whether this preset rule runs through an Oxlint jsPlugin. Preset-scoped; see
 * {@link isPresetRuleOxlintCovered}.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether the rule is routed to a jsPlugin.
 */
export function isPresetRuleJsPlugin(rule: string): boolean {
	return presetRuleMapping()[rule] === "js-plugin";
}

/**
 * Whether Oxlint runs this rule through oxlint-tsgolint.
 *
 * Resolver-backed rather than preset-scoped: the emit path gates rules on this,
 * and a type-aware rule missing from the sampled view would otherwise be
 * emitted with `typeAware: false` for tsgolint to never run.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether the rule is routed to tsgolint.
 */
export function runsInTsgolint(rule: string): boolean {
	return routeTarget(resolveOxlintRule(rule)) === "tsgolint";
}

/**
 * Translate a canonical ESLint rule name into its Oxlint configuration name.
 * This remains total, including aliases for rules that intentionally stay in
 * ESLint and unmanaged standalone rules.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns The Oxlint configuration name for the rule.
 */
export function translateRuleToOxlint(rule: string): string {
	const route = resolveOxlintRule(rule);
	if (route.kind === "native" || route.kind === "js-plugin") {
		return route.oxlintName;
	}

	// The route is eslint-only or unmanaged, but the rule still has a stable
	// oxlint name: its jsPlugin alias where a plugin owns the prefix, otherwise
	// the native candidate, which is the rule itself for anything unrecognized.
	return jsPluginAdapterFor(rule)?.oxlintName ?? candidateNativeOxlintName(rule);
}

/**
 * Whether a `ts/*` extension collapses onto a parity-tested core rule.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether the rule is a collapsing `ts/*` extension.
 */
export function collapsesToTsCoreRule(rule: string): boolean {
	const { name, prefix } = splitRuleName(rule);
	return prefix === "ts" && TS_EXTENSION_TO_CORE.has(name);
}

/**
 * Whether this is the core counterpart of a collapsing TypeScript rule.
 *
 * @param rule - The canonical ESLint rule name.
 * @returns Whether the rule is the core counterpart.
 */
export function isTsCoreCounterpartRule(rule: string): boolean {
	const { name, prefix } = splitRuleName(rule);
	return prefix === "" && TS_EXTENSION_TO_CORE.has(name);
}

/**
 * The compatibility view, built on first use and reused after.
 *
 * @returns The rule-to-target map.
 */
function presetRuleMapping(): Readonly<Record<string, OxlintTarget>> {
	cachedMapping ??= buildOxlintRuleMapping();
	return cachedMapping;
}

export { oxlintJsPlugins } from "./adapters.ts";
